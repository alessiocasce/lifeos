import {
  HttpError,
  createRequestContext,
  handleApiError,
  handleOptions,
  readJsonBody,
  requirePost,
  sendJson,
} from '../../_utils/http.js';
import { getActionUserId } from '../../_utils/supabaseAdmin.js';
import { getDebugFlags, sanitizeTraceValue } from '../../_utils/brainTrace.js';
import { describeWhatsappSender, requireWhatsappBridgeSecret, validateWhatsappSender, cleanWhatsappText } from '../../_utils/whatsappBridge.js';
import { evaluateProactiveCandidates } from '../../_utils/brainProactiveRules.js';
import { ackOutboxMessage, enqueueOutboxMessage, pollOutboxMessages } from '../../_utils/brainOutbox.js';
import {
  normalizeWhatsappProviderMessageId,
  normalizeWhatsappProviderMessageIds,
  recordWhatsappMessageDeliveries,
} from '../../_utils/brainWhatsappReliability.js';

const SUPPORTED_ACTIONS = new Set(['evaluate', 'preview', 'poll', 'ack', 'record_reply_delivery']);

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  const debugFlags = getDebugFlags(req);
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    requireWhatsappBridgeSecret(req);
    const body = await readJsonBody(req);
    const action = getOutboxAction(req, body);
    const rawRecipient = body.recipient ?? body.to ?? body.from;
    const recipient = validateWhatsappSender(rawRecipient, Boolean(body.is_group ?? body.isGroup));
    const recipientInfo = describeWhatsappSender(rawRecipient);
    const bridgeId = cleanWhatsappText(body.bridge_id ?? body.bridgeId, 120);

    if (action === 'evaluate' || action === 'preview') {
      return handleEvaluate({ res, context, debugFlags, recipient, recipientInfo, bridgeId, preview: action === 'preview' });
    }
    if (action === 'poll') {
      return handlePoll({ res, context, debugFlags, body, recipient, recipientInfo, bridgeId });
    }
    if (action === 'ack') {
      return handleAck({ res, context, debugFlags, body, recipient, recipientInfo, bridgeId });
    }
    if (action === 'record_reply_delivery') {
      return handleRecordReplyDelivery({ res, context, body, recipient });
    }

    throw new HttpError(400, 'Unsupported outbox action.');
  } catch (error) {
    return handleApiError(res, error, context);
  }
}

async function handleRecordReplyDelivery({ res, context, body, recipient }) {
  const results = await recordWhatsappMessageDeliveries({
    assistantMessageId: cleanWhatsappText(body.assistant_message_id ?? body.assistantMessageId, 80),
    threadId: cleanWhatsappText(body.thread_id ?? body.threadId, 80),
    recipient,
    providerMessageId: body.provider_message_id ?? body.providerMessageId,
    providerMessageIds: body.provider_message_ids ?? body.providerMessageIds,
    sentAt: body.sent_at ?? body.sentAt,
  });
  return sendJson(res, 200, {
    ok: true,
    requestId: context.requestId,
    recorded: true,
    duplicate: results.every((result) => result.duplicate),
    recorded_count: results.length,
    assistant_message_id: results[0].row.assistant_message_id,
  });
}

async function handleEvaluate({ res, context, debugFlags, recipient, recipientInfo, bridgeId, preview = false }) {
  const userId = getActionUserId();
  const evaluation = await evaluateProactiveCandidates({ userId, recipient });
  const queued = [];
  const skipped = [...evaluation.skipped];

  for (const candidate of preview ? [] : evaluation.candidates) {
    const metadata = {
      ...candidate.metadata,
      bridge_id: bridgeId,
      whatsapp_recipient_raw: recipientInfo.raw,
      whatsapp_recipient_canonical: recipient,
      proactive_trace: {
        ...(candidate.metadata?.proactive_trace ?? {}),
        decision: 'queued',
      },
    };
    const result = await enqueueOutboxMessage({
      userId,
      channel: candidate.channel,
      recipient: candidate.recipient,
      body: candidate.body,
      priority: candidate.priority,
      ruleKey: candidate.rule_key,
      sourceType: candidate.source_type,
      sourceId: candidate.source_id,
      idempotencyKey: candidate.idempotency_key,
      scheduledFor: candidate.scheduled_for,
      expiresAt: candidate.expires_at,
      metadata,
    });
    if (result.duplicate || result.deferred) {
      skipped.push({ candidate, reason: result.deferred ? 'attention_deferred' : 'duplicate' });
    } else {
      queued.push(result.row);
    }
  }

  return sendJson(res, 200, {
    ok: true,
    requestId: context.requestId,
    evaluated: true,
    preview,
    queued: queued.length,
    skipped: skipped.length,
    ...(debugFlags.enabled ? {
      debug: {
        candidates: sanitizeTraceValue(evaluation.candidates.map(compactCandidate)),
        queued: sanitizeTraceValue(queued.map(compactOutbox)),
        skipped: sanitizeTraceValue(skipped.map((item) => ({
          reason: item.reason,
          candidate: compactCandidate(item.candidate),
        }))),
      },
    } : {}),
  });
}

async function handlePoll({ res, context, debugFlags, body, recipient, recipientInfo, bridgeId }) {
  const messages = await pollOutboxMessages({
    recipient,
    bridgeId,
    limit: body.limit,
  });

  return sendJson(res, 200, {
    ok: true,
    requestId: context.requestId,
    messages: messages.map(formatBridgeMessage),
    ...(debugFlags.enabled ? {
      debug: {
        outbox_claimed_count: messages.diagnostics?.outbox_claimed_count ?? messages.length,
        outbox_reclaimed_count: messages.diagnostics?.outbox_reclaimed_count ?? null,
        outbox_expired_count: messages.diagnostics?.outbox_expired_count ?? null,
        whatsapp_recipient_raw: recipientInfo.raw,
        whatsapp_recipient_canonical: recipient,
        claimed: sanitizeTraceValue(messages.map((item) => ({
          id: item.id,
          rule_key: item.rule_key,
          status: item.status,
          attempts: item.attempts,
          scheduled_for: item.scheduled_for,
        }))),
      },
    } : {}),
  });
}

async function handleAck({ res, context, debugFlags, body, recipient, recipientInfo, bridgeId }) {
  if (body.dry_run || body.dryRun) throw new HttpError(400, 'ACK is mutating. Use preview for read-only diagnostics.');
  const rawProviderMessageId = body.provider_message_id ?? body.providerMessageId;
  const providerMessageId = rawProviderMessageId === undefined || rawProviderMessageId === null || rawProviderMessageId === ''
    ? null
    : normalizeWhatsappProviderMessageId(rawProviderMessageId);
  if (rawProviderMessageId !== undefined && rawProviderMessageId !== null && rawProviderMessageId !== '' && !providerMessageId) {
    throw new HttpError(400, 'provider_message_id is invalid.');
  }
  const rawProviderMessageIds = body.provider_message_ids ?? body.providerMessageIds;
  const providerMessageIds = normalizeWhatsappProviderMessageIds(rawProviderMessageIds, providerMessageId);
  if (rawProviderMessageIds !== undefined
    && (!Array.isArray(rawProviderMessageIds) || rawProviderMessageIds.some((value) => !normalizeWhatsappProviderMessageId(value)))) {
    throw new HttpError(400, 'provider_message_ids is invalid.');
  }
  const row = await ackOutboxMessage({
    recipient,
    messageId: body.message_id ?? body.messageId ?? body.id,
    status: body.status,
    deliveryAttempt: body.delivery_attempt,
    error: body.error,
    metadata: {
      bridge_id: bridgeId,
      whatsapp_recipient_raw: recipientInfo.raw,
      whatsapp_recipient_canonical: recipient,
      provider_message_id: providerMessageId,
      provider_message_ids: providerMessageIds,
      dry_run: Boolean(body.dry_run ?? body.dryRun),
    },
  });

  return sendJson(res, 200, {
    ok: true,
    requestId: context.requestId,
    status: row.status,
    message_id: row.id,
    ...(debugFlags.enabled ? {
      debug: {
        outbox: sanitizeTraceValue({
          id: row.id,
          status: row.status,
          rule_key: row.rule_key,
          attempts: row.attempts,
          sent_at: row.sent_at,
          failed_at: row.failed_at,
          last_error: row.last_error,
          outbox_ack_transition: row.ack_metadata?.outbox_ack_transition ?? null,
          whatsapp_recipient_raw: recipientInfo.raw,
          whatsapp_recipient_canonical: recipient,
          ack_metadata: row.ack_metadata,
        }),
        delivery_mapping: sanitizeTraceValue(row.delivery_mapping ?? null),
      },
    } : {}),
  });
}

function getOutboxAction(req, body) {
  const rawAction = body.action ?? req.query?.action ?? getUrlAction(req);
  const action = String(rawAction ?? '').trim().toLowerCase();
  if (!action) throw new HttpError(400, 'action is required. Use evaluate, poll, ack, or record_reply_delivery.');
  if (!SUPPORTED_ACTIONS.has(action)) throw new HttpError(400, 'Unsupported outbox action.');
  return action;
}

function getUrlAction(req) {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    return url.searchParams.get('action');
  } catch {
    return null;
  }
}

function compactCandidate(candidate) {
  return {
    rule_key: candidate?.rule_key,
    source_type: candidate?.source_type,
    source_id: candidate?.source_id,
    idempotency_key: candidate?.idempotency_key,
    scheduled_for: candidate?.scheduled_for,
    expires_at: candidate?.expires_at,
    body_preview: String(candidate?.body ?? '').slice(0, 160),
  };
}

function compactOutbox(row) {
  return {
    id: row?.id,
    status: row?.status,
    rule_key: row?.rule_key,
    source_type: row?.source_type,
    source_id: row?.source_id,
    scheduled_for: row?.scheduled_for,
  };
}

function formatBridgeMessage(row) {
  return {
    id: row.id,
    delivery_attempt: row.attempts,
    to: row.recipient,
    body: row.body,
    rule_key: row.rule_key,
    source_type: row.source_type,
    source_id: row.source_id,
    metadata: {
      expected_reply_type: row.metadata?.expected_reply_type ?? null,
      language: row.metadata?.language ?? null,
    },
  };
}
