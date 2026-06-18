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
import { requireWhatsappBridgeSecret, validateWhatsappSender, cleanWhatsappText } from '../../_utils/whatsappBridge.js';
import { evaluateProactiveCandidates } from '../../_utils/brainProactiveRules.js';
import { ackOutboxMessage, enqueueOutboxMessage, pollOutboxMessages } from '../../_utils/brainOutbox.js';

const SUPPORTED_ACTIONS = new Set(['evaluate', 'poll', 'ack']);

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  const debugFlags = getDebugFlags(req);
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    requireWhatsappBridgeSecret(req);
    const body = await readJsonBody(req);
    const action = getOutboxAction(req, body);
    const recipient = validateWhatsappSender(body.recipient ?? body.to ?? body.from, Boolean(body.is_group ?? body.isGroup));
    const bridgeId = cleanWhatsappText(body.bridge_id ?? body.bridgeId, 120);

    if (action === 'evaluate') {
      return handleEvaluate({ res, context, debugFlags, recipient, bridgeId });
    }
    if (action === 'poll') {
      return handlePoll({ res, context, debugFlags, body, recipient, bridgeId });
    }
    if (action === 'ack') {
      return handleAck({ res, context, debugFlags, body, recipient, bridgeId });
    }

    throw new HttpError(400, 'Unsupported outbox action.');
  } catch (error) {
    return handleApiError(res, error, context);
  }
}

async function handleEvaluate({ res, context, debugFlags, recipient, bridgeId }) {
  const userId = getActionUserId();
  const evaluation = await evaluateProactiveCandidates({ userId, recipient });
  const queued = [];
  const skipped = [...evaluation.skipped];

  for (const candidate of evaluation.candidates) {
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
      metadata: {
        ...candidate.metadata,
        bridge_id: bridgeId,
        proactive_trace: {
          ...(candidate.metadata?.proactive_trace ?? {}),
          decision: result.duplicate ? 'duplicate' : 'queued',
        },
      },
    });
    if (result.duplicate) {
      skipped.push({ candidate, reason: 'duplicate' });
    } else {
      queued.push(result.row);
    }
  }

  return sendJson(res, 200, {
    ok: true,
    requestId: context.requestId,
    evaluated: true,
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

async function handlePoll({ res, context, debugFlags, body, recipient, bridgeId }) {
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

async function handleAck({ res, context, debugFlags, body, recipient, bridgeId }) {
  const row = await ackOutboxMessage({
    recipient,
    messageId: body.message_id ?? body.messageId ?? body.id,
    status: body.status,
    error: body.error,
    metadata: {
      bridge_id: bridgeId,
      provider_message_id: cleanWhatsappText(body.provider_message_id ?? body.providerMessageId, 180),
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
          ack_metadata: row.ack_metadata,
        }),
      },
    } : {}),
  });
}

function getOutboxAction(req, body) {
  const rawAction = body.action ?? req.query?.action ?? getUrlAction(req);
  const action = String(rawAction ?? '').trim().toLowerCase();
  if (!action) throw new HttpError(400, 'action is required. Use evaluate, poll, or ack.');
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
