// Reference helpers to copy into the external Oracle whatsapp-web.js bridge.
// Object IDs are never stringified because "[object Object]" is not stable identity.
export function extractWhatsappProviderMessageId(value) {
  if (typeof value === 'string') return normalizeId(value);
  if (!value || typeof value !== 'object') return null;
  if (typeof value._serialized === 'string') return normalizeId(value._serialized);
  if (typeof value.$1 === 'string') return normalizeId(value.$1);
  if (value.id && typeof value.id === 'object' && value.id !== value) return extractWhatsappProviderMessageId(value.id);
  return null;
}

export async function buildWhatsappInboundQuoteEnvelope(message) {
  if (!message?.hasQuotedMsg) return { has_quoted_message: false };
  try {
    const quoted = await message.getQuotedMessage();
    return {
      has_quoted_message: true,
      quoted_provider_message_id: extractWhatsappProviderMessageId(quoted?.id),
      quoted_from_me: quoted?.fromMe === true,
      quoted_chat_id: normalizeId(quoted?.from),
    };
  } catch {
    return {
      has_quoted_message: true,
      quoted_provider_message_id: null,
      quoted_from_me: null,
      quoted_chat_id: null,
    };
  }
}

export function buildWhatsappReplyDeliveryPayload({ inboundResponse, sentMessage, recipient, bridgeId, sentAt = new Date() } = {}) {
  const providerMessageId = extractWhatsappProviderMessageId(sentMessage?.id ?? sentMessage);
  if (!inboundResponse?.assistant_message_id || !inboundResponse?.thread_id || !providerMessageId) return null;
  return {
    action: 'record_reply_delivery',
    assistant_message_id: inboundResponse.assistant_message_id,
    thread_id: inboundResponse.thread_id,
    recipient,
    provider_message_id: providerMessageId,
    sent_at: sentAt.toISOString(),
    ...(bridgeId ? { bridge_id: String(bridgeId).slice(0, 120) } : {}),
  };
}

function normalizeId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || id.length > 300 || id === '[object Object]' || /[\u0000-\u001f\u007f]/.test(id)) return null;
  return id;
}
