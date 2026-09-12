'use strict';

const { createHash } = require('node:crypto');

const PROVIDER_ID_MAX = 300;
const PROVIDER_ID_LIMIT = 32;
const OUTGOING_ID_TIMEOUT_MS = 10000;

function normalizeWhatsappProviderId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || id.length > PROVIDER_ID_MAX || id === '[object Object]' || /[\u0000-\u001f\u007f]/.test(id)) {
    return null;
  }
  return id;
}

function extractWhatsappProviderMessageIds(value, seen = new Set()) {
  if (typeof value === 'string') {
    const normalized = normalizeWhatsappProviderId(value);
    return normalized ? [normalized] : [];
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);

  const candidates = [];
  addCandidate(candidates, value.$1);
  addCandidate(candidates, value._serialized);

  if (value.id && typeof value.id === 'object') {
    candidates.push(...extractWhatsappProviderMessageIds(value.id, seen));
  }

  const rawId = normalizeWhatsappProviderId(typeof value.id === 'string' ? value.id : null);
  const remote = extractWhatsappRemoteId(value.remote, seen);
  if (rawId && remote && typeof value.fromMe === 'boolean') {
    addCandidate(candidates, `${value.fromMe}_${remote}_${rawId}`);
  }

  return [...new Set(candidates)].slice(0, PROVIDER_ID_LIMIT);
}

function extractWhatsappProviderMessageId(value) {
  return extractWhatsappProviderMessageIds(value)[0] || null;
}

function ensureWhatsappSerializedIdCompatibility(message) {
  const key = message?.id;
  if (!key || typeof key !== 'object' || normalizeWhatsappProviderId(key._serialized)) return false;
  const current = normalizeWhatsappProviderId(key.$1);
  if (!current) return false;
  try {
    key._serialized = current;
    return key._serialized === current;
  } catch {
    return false;
  }
}

async function buildWhatsappInboundQuoteEnvelope(message) {
  if (!message?.hasQuotedMsg) return { has_quoted_message: false };

  ensureWhatsappSerializedIdCompatibility(message);
  let quoted = null;
  let lookupError = null;
  try {
    quoted = await message.getQuotedMessage();
  } catch (error) {
    lookupError = error;
  }

  const quotedKey = quoted?.id
    || message?.rawData?.quotedMsg?.id
    || message?._data?.quotedMsg?.id
    || message?.rawData?.quotedMsg
    || message?._data?.quotedMsg;
  const providerMessageIds = extractWhatsappProviderMessageIds(quotedKey);
  const quotedChatId = normalizeWhatsappProviderId(
    quoted?.from
      || message?.rawData?.quotedMsg?.from
      || message?._data?.quotedMsg?.from,
  );

  return {
    has_quoted_message: true,
    quoted_provider_message_id: providerMessageIds[0] || null,
    quoted_provider_message_ids: providerMessageIds,
    quoted_from_me: quoted?.fromMe === true
      || message?.rawData?.quotedMsg?.id?.fromMe === true
      || message?._data?.quotedMsg?.id?.fromMe === true,
    quoted_chat_id: quotedChatId,
    quote_resolution: quoted
      ? 'get_quoted_message'
      : providerMessageIds.length
        ? 'raw_data_fallback'
        : lookupError
          ? 'lookup_failed'
          : 'id_missing',
  };
}

function buildWhatsappReplyDeliveryPayload({
  inboundResponse,
  sentMessage,
  recipient,
  bridgeId,
  sentAt = new Date(),
} = {}) {
  const providerMessageIds = extractWhatsappProviderMessageIds(sentMessage?.id ?? sentMessage);
  if (!inboundResponse?.assistant_message_id || !inboundResponse?.thread_id || !providerMessageIds.length) return null;
  return {
    action: 'record_reply_delivery',
    assistant_message_id: inboundResponse.assistant_message_id,
    thread_id: inboundResponse.thread_id,
    recipient,
    provider_message_id: providerMessageIds[0],
    provider_message_ids: providerMessageIds,
    sent_at: sentAt.toISOString(),
    ...(bridgeId ? { bridge_id: String(bridgeId).slice(0, 120) } : {}),
  };
}

function buildWhatsappOutboxAckPayload({
  recipient,
  messageId,
  deliveryAttempt = null,
  status,
  providerMessageId = null,
  providerMessageIds = [],
  error = null,
  bridgeId = null,
  metadata = {},
} = {}) {
  const normalizedProviderIds = [...new Set([
    providerMessageId,
    ...(Array.isArray(providerMessageIds) ? providerMessageIds : []),
  ].flatMap((value) => extractWhatsappProviderMessageIds(value)))].slice(0, PROVIDER_ID_LIMIT);
  return {
    action: 'ack',
    recipient,
    message_id: messageId,
    delivery_attempt: deliveryAttempt,
    status,
    provider_message_id: normalizedProviderIds[0] || null,
    provider_message_ids: normalizedProviderIds,
    error,
    ...(bridgeId ? { bridge_id: String(bridgeId).slice(0, 120) } : {}),
    metadata,
  };
}

function describeWhatsappProviderId(value) {
  const id = extractWhatsappProviderMessageId(value);
  if (!id) return { present: false };
  const pieces = id.split('_');
  return {
    present: true,
    length: id.length,
    serialized: pieces.length >= 3,
    from_me: pieces[0] === 'true' ? true : pieces[0] === 'false' ? false : null,
    address_type: id.includes('@lid') ? 'lid' : id.includes('@c.us') ? 'c.us' : 'other',
    fingerprint: createHash('sha256').update(id).digest('hex').slice(0, 12),
  };
}

async function sendWhatsappMessageWithProviderIdentity({
  client,
  recipient,
  body,
  send = null,
  timeoutMs = OUTGOING_ID_TIMEOUT_MS,
} = {}) {
  if (!client || typeof client.on !== 'function') throw new Error('WhatsApp client is required.');
  const sendMessage = typeof send === 'function'
    ? send
    : () => client.sendMessage(recipient, body);
  let observedMessage = null;
  let resolveObserved;
  const observed = new Promise((resolve) => {
    resolveObserved = resolve;
  });
  const onMessageCreate = (message) => {
    if (observedMessage || !matchesOutgoingMessage(message, { recipient, body })) return;
    observedMessage = message;
    resolveObserved(message);
  };
  client.on('message_create', onMessageCreate);
  try {
    const returnedMessage = await sendMessage();
    if (extractWhatsappProviderMessageIds(returnedMessage?.id ?? returnedMessage).length) {
      return { message: returnedMessage, identity_source: 'send_result' };
    }
    const capturedMessage = observedMessage || await waitForObservedMessage(observed, timeoutMs);
    if (capturedMessage && extractWhatsappProviderMessageIds(capturedMessage?.id ?? capturedMessage).length) {
      return { message: capturedMessage, identity_source: 'message_create' };
    }
    const error = new Error('WhatsApp message was sent without a recoverable provider identity.');
    error.code = 'WHATSAPP_PROVIDER_ID_UNAVAILABLE';
    throw error;
  } finally {
    if (typeof client.off === 'function') client.off('message_create', onMessageCreate);
    else if (typeof client.removeListener === 'function') client.removeListener('message_create', onMessageCreate);
  }
}

function matchesOutgoingMessage(message, { recipient, body } = {}) {
  const ids = extractWhatsappProviderMessageIds(message?.id ?? message);
  if (!ids.length) return false;
  const fromMe = message?.fromMe === true || message?.id?.fromMe === true;
  if (!fromMe) return false;
  if (typeof message?.body === 'string' && message.body !== body) return false;
  const expectedRecipient = normalizeWhatsappProviderId(recipient);
  const actualRecipient = normalizeWhatsappProviderId(message?.to)
    || extractWhatsappRemoteId(message?.id?.remote, new Set());
  return !expectedRecipient || !actualRecipient || expectedRecipient === actualRecipient;
}

function waitForObservedMessage(observed, timeoutMs) {
  const safeTimeout = Number.isFinite(Number(timeoutMs))
    ? Math.max(100, Math.min(Number(timeoutMs), 60000))
    : OUTGOING_ID_TIMEOUT_MS;
  return Promise.race([
    observed,
    new Promise((resolve) => setTimeout(() => resolve(null), safeTimeout)),
  ]);
}

function addCandidate(target, value) {
  const normalized = normalizeWhatsappProviderId(value);
  if (normalized) target.push(normalized);
}

function extractWhatsappRemoteId(value, seen) {
  if (typeof value === 'string') return normalizeWhatsappProviderId(value);
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  const candidates = extractWhatsappProviderMessageIds(value, seen);
  return candidates[0] || null;
}

module.exports = {
  buildWhatsappInboundQuoteEnvelope,
  buildWhatsappOutboxAckPayload,
  buildWhatsappReplyDeliveryPayload,
  describeWhatsappProviderId,
  ensureWhatsappSerializedIdCompatibility,
  extractWhatsappProviderMessageId,
  extractWhatsappProviderMessageIds,
  normalizeWhatsappProviderId,
  sendWhatsappMessageWithProviderIdentity,
};
