import {
  HttpError,
  createRequestContext,
  handleApiError,
  handleOptions,
  readJsonBody,
  requirePost,
  sendJson,
} from '../../_utils/http.js';
import { getDebugFlags, sanitizeTraceValue } from '../../_utils/brainTrace.js';
import { handleBrainChatMessage } from '../../ai/chat.js';
import { describeWhatsappSender, requireWhatsappBridgeSecret, validateWhatsappSender } from '../../_utils/whatsappBridge.js';
import { getActionUserId } from '../../_utils/supabaseAdmin.js';
import {
  buildWhatsappRequestIdentity,
  claimWhatsappInboundReceipt,
  completeWhatsappInboundReceipt,
  markWhatsappInboundReceiptFailedBeforeEffect,
  markWhatsappInboundReceiptUncertain,
  fingerprintWhatsappProviderMessageId,
  normalizeWhatsappProviderMessageId,
  normalizeWhatsappProviderMessageIds,
  resolveWhatsappQuotedDelivery,
} from '../../_utils/brainWhatsappReliability.js';

const MAX_WHATSAPP_BODY_LENGTH = 4000;

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  const debugFlags = getDebugFlags(req);
  const endpointTrace = {
    source: 'whatsapp',
    secret_validated: false,
    sender_allowed: false,
    endpoint_validation_result: 'started',
  };
  let receiptClaim = null;
  let brainExecutionStarted = false;
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    requireWhatsappBridgeSecret(req);
    endpointTrace.secret_validated = true;

    const payload = normalizeWhatsappPayload(await readJsonBody(req));
    const senderInfo = describeWhatsappSender(payload.from);
    endpointTrace.whatsapp_sender = senderInfo.canonical || payload.from;
    endpointTrace.whatsapp_raw_sender = senderInfo.raw;
    endpointTrace.whatsapp_sender_aliased = senderInfo.aliased;
    endpointTrace.whatsapp_message_id_fingerprint = fingerprintWhatsappProviderMessageId(payload.message_id);
    endpointTrace.is_group = payload.is_group;
    const canonicalSender = validateWhatsappSender(payload.from, payload.is_group);
    endpointTrace.sender_allowed = true;
    endpointTrace.endpoint_validation_result = 'accepted';

    const userId = getActionUserId();
    receiptClaim = await claimWhatsappInboundReceipt({
      userId,
      recipient: canonicalSender,
      providerMessageId: payload.message_id,
    });
    endpointTrace.inbound_receipt_mode = receiptClaim.mode;
    if (receiptClaim.mode === 'replay') {
      return sendJson(res, 200, {
        ...receiptClaim.response,
        source: 'whatsapp',
        requestId: context.requestId,
        idempotent_replay: true,
      });
    }
    if (receiptClaim.mode === 'processing') throw new HttpError(409, 'WhatsApp message is already being processed.');
    if (receiptClaim.mode === 'uncertain') throw new HttpError(409, 'WhatsApp message has an uncertain prior outcome and was not replayed.');

    const quotedLookup = payload.has_quoted_message && payload.quoted_provider_message_ids.length
      ? await resolveWhatsappQuotedDelivery({
        userId,
        recipient: canonicalSender,
        providerMessageId: payload.quoted_provider_message_id,
        providerMessageIds: payload.quoted_provider_message_ids,
        detailed: true,
      })
      : { status: payload.has_quoted_message ? 'quoted_provider_id_missing' : 'not_quoted', target: null };
    const quotedTarget = quotedLookup.target;
    endpointTrace.whatsapp_quote_present = payload.has_quoted_message;
    endpointTrace.whatsapp_quote_resolved = Boolean(quotedTarget);
    endpointTrace.whatsapp_quote_lookup_status = quotedLookup.status;
    endpointTrace.whatsapp_quote_provider_id_count = payload.quoted_provider_message_ids.length;
    endpointTrace.whatsapp_quote_provider_id_fingerprints = payload.quoted_provider_message_ids
      .map(fingerprintWhatsappProviderMessageId).filter(Boolean);
    endpointTrace.whatsapp_quote_assistant_message_id = quotedTarget?.message?.id ?? null;
    endpointTrace.whatsapp_quote_outbox_message_id = quotedTarget?.delivery?.outbox_message_id ?? null;
    endpointTrace.whatsapp_quote_source_type = quotedTarget?.message?.metadata?.source_type ?? null;
    const clientRequestId = buildWhatsappRequestIdentity({
      userId,
      recipient: canonicalSender,
      providerMessageId: payload.message_id,
    }) || buildWhatsappClientRequestId({ ...payload, from: canonicalSender }, context.requestId);
    brainExecutionStarted = true;
    const result = await handleBrainChatMessage({
      message: payload.body,
      source: 'whatsapp',
      requestId: context.requestId,
      clientRequestId,
      responseMode: 'whatsapp',
      debugFlags,
      endpointTrace,
      channelMetadata: {
        source: 'whatsapp',
        channel: 'whatsapp',
        whatsapp_sender: canonicalSender,
        whatsapp_raw_sender: payload.from,
        whatsapp_author: payload.author,
        whatsapp_message_id: payload.message_id,
        whatsapp_timestamp: payload.timestamp,
        whatsapp_type: payload.type,
        whatsapp_is_group: payload.is_group,
        whatsapp_has_quoted_message: payload.has_quoted_message,
        whatsapp_quoted_provider_message_id_fingerprints: payload.quoted_provider_message_ids
          .map(fingerprintWhatsappProviderMessageId).filter(Boolean),
        whatsapp_quote_lookup_status: quotedLookup.status,
        whatsapp_quoted_from_me: payload.quoted_from_me,
        whatsapp_quoted_chat_id: payload.quoted_chat_id,
        quoted_target: quotedTarget,
      },
    });

    await completeWhatsappInboundReceipt({
      userId,
      receiptId: receiptClaim.receipt?.id,
      leaseToken: receiptClaim.leaseToken,
      result,
    });

    return sendJson(res, 200, {
      reply: String(result?.answer ?? ''),
      thread_id: result?.thread_id ?? null,
      assistant_message_id: result?.persisted_message?.id ?? null,
      source: 'whatsapp',
      requestId: context.requestId,
      ...(result?.debug ? { debug: result.debug } : {}),
    });
  } catch (error) {
    try {
      const markReceipt = brainExecutionStarted
        ? markWhatsappInboundReceiptUncertain
        : markWhatsappInboundReceiptFailedBeforeEffect;
      await markReceipt({ receiptId: receiptClaim?.receipt?.id, leaseToken: receiptClaim?.leaseToken, error });
    } catch {
      // Preserve the original request error; receipt diagnostics remain best effort.
    }
    endpointTrace.endpoint_validation_result = 'rejected';
    if (debugFlags.enabled) {
      console.warn('BRAIN_TRACE', JSON.stringify(sanitizeTraceValue({
        source: 'whatsapp',
        requestId: context.requestId,
        endpoint_validation_result: endpointTrace.endpoint_validation_result,
        secret_validated: endpointTrace.secret_validated,
        sender_allowed: endpointTrace.sender_allowed,
        whatsapp_sender: endpointTrace.whatsapp_sender,
        whatsapp_raw_sender: endpointTrace.whatsapp_raw_sender,
        whatsapp_sender_aliased: endpointTrace.whatsapp_sender_aliased,
        status: error?.status ?? 500,
        error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
      })));
    }
    return handleApiError(res, error, context);
  }
}

function normalizeWhatsappPayload(body = {}) {
  const from = cleanText(body.from, 160);
  const rawBody = typeof body.body === 'string' ? body.body : null;
  const text = rawBody ? rawBody.trim() : '';
  const type = cleanText(body.type, 40) || 'chat';

  if (!from) throw new HttpError(400, 'from is required.');
  if (rawBody === null) throw new HttpError(400, 'body must be a string.');
  if (!text) throw new HttpError(400, 'body is required.');
  if (text.length > MAX_WHATSAPP_BODY_LENGTH) {
    throw new HttpError(400, `body must be ${MAX_WHATSAPP_BODY_LENGTH} characters or fewer.`);
  }
  if (type !== 'chat') {
    throw new HttpError(400, 'Only text chat messages are supported in WhatsApp inbound v1.');
  }
  const rawMessageId = body.message_id ?? body.messageId ?? body.id;
  const messageId = rawMessageId === undefined || rawMessageId === null || rawMessageId === ''
    ? null
    : normalizeWhatsappProviderMessageId(rawMessageId);
  if (rawMessageId !== undefined && rawMessageId !== null && rawMessageId !== '' && !messageId) {
    throw new HttpError(400, 'message_id is invalid.');
  }
  const quotedProviderMessageId = normalizeWhatsappProviderMessageId(body.quoted_provider_message_id ?? body.quotedProviderMessageId);
  const rawQuotedProviderMessageIds = body.quoted_provider_message_ids ?? body.quotedProviderMessageIds;
  if (rawQuotedProviderMessageIds !== undefined
    && (!Array.isArray(rawQuotedProviderMessageIds) || rawQuotedProviderMessageIds.some((value) => !normalizeWhatsappProviderMessageId(value)))) {
    throw new HttpError(400, 'quoted_provider_message_ids is invalid.');
  }
  const quotedProviderMessageIds = normalizeWhatsappProviderMessageIds(rawQuotedProviderMessageIds, quotedProviderMessageId);

  return {
    from,
    author: cleanText(body.author, 160),
    message_id: messageId,
    body: text,
    timestamp: normalizeTimestamp(body.timestamp),
    type,
    is_group: Boolean(body.is_group ?? body.isGroup),
    source: cleanText(body.source, 40) || 'whatsapp',
    has_quoted_message: Boolean(body.has_quoted_message ?? body.hasQuotedMessage),
    quoted_provider_message_id: quotedProviderMessageId,
    quoted_provider_message_ids: quotedProviderMessageIds,
    quoted_from_me: Boolean(body.quoted_from_me ?? body.quotedFromMe),
    quoted_chat_id: cleanText(body.quoted_chat_id ?? body.quotedChatId, 180),
  };
}

function buildWhatsappClientRequestId(payload, requestId) {
  const messageId = payload.message_id || payload.timestamp || requestId;
  return `whatsapp:${payload.from}:${messageId}`;
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value, maxLength) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maxLength) : null;
}
