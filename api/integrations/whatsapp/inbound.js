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
import { requireWhatsappBridgeSecret, validateWhatsappSender } from '../../_utils/whatsappBridge.js';

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
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    requireWhatsappBridgeSecret(req);
    endpointTrace.secret_validated = true;

    const payload = normalizeWhatsappPayload(await readJsonBody(req));
    endpointTrace.whatsapp_sender = payload.from;
    endpointTrace.whatsapp_message_id = payload.message_id;
    endpointTrace.is_group = payload.is_group;
    validateWhatsappSender(payload.from, payload.is_group);
    endpointTrace.sender_allowed = true;
    endpointTrace.endpoint_validation_result = 'accepted';

    const clientRequestId = buildWhatsappClientRequestId(payload, context.requestId);
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
        whatsapp_sender: payload.from,
        whatsapp_author: payload.author,
        whatsapp_message_id: payload.message_id,
        whatsapp_timestamp: payload.timestamp,
        whatsapp_type: payload.type,
        whatsapp_is_group: payload.is_group,
      },
    });

    return sendJson(res, 200, {
      reply: String(result?.answer ?? ''),
      thread_id: result?.thread_id ?? null,
      source: 'whatsapp',
      requestId: context.requestId,
      ...(result?.debug ? { debug: result.debug } : {}),
    });
  } catch (error) {
    endpointTrace.endpoint_validation_result = 'rejected';
    if (debugFlags.enabled) {
      console.warn('BRAIN_TRACE', JSON.stringify(sanitizeTraceValue({
        source: 'whatsapp',
        requestId: context.requestId,
        endpoint_validation_result: endpointTrace.endpoint_validation_result,
        secret_validated: endpointTrace.secret_validated,
        sender_allowed: endpointTrace.sender_allowed,
        whatsapp_sender: endpointTrace.whatsapp_sender,
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

  return {
    from,
    author: cleanText(body.author, 160),
    message_id: cleanText(body.message_id ?? body.messageId ?? body.id, 180),
    body: text,
    timestamp: normalizeTimestamp(body.timestamp),
    type,
    is_group: Boolean(body.is_group ?? body.isGroup),
    source: cleanText(body.source, 40) || 'whatsapp',
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
