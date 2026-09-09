import { createHash, randomUUID } from 'node:crypto';
import { HttpError } from './http.js';
import { normalizeAccountabilityTarget, sanitizeBrainMetadata } from './brainMetadata.js';
import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import { canonicalizeWhatsappSender } from './whatsappBridge.js';

const RECEIPT_LEASE_MINUTES = 5;
const INTERACTION_LEASE_MINUTES = 30;
const PROVIDER_ID_MAX = 300;

export function normalizeWhatsappProviderMessageId(value) {
  const id = String(value ?? '').trim();
  if (!id || id.length > PROVIDER_ID_MAX || id === '[object Object]' || /[\u0000-\u001f\u007f]/.test(id)) return null;
  return id;
}

export function buildWhatsappRequestIdentity({ userId, recipient, providerMessageId }) {
  const id = normalizeWhatsappProviderMessageId(providerMessageId);
  if (!id) return null;
  return `whatsapp:${createHash('sha256').update(`${userId}|whatsapp|${recipient}|${id}`).digest('hex')}`;
}

export async function claimWhatsappInboundReceipt({
  userId = getActionUserId(),
  recipient,
  providerMessageId,
  now = new Date(),
  client = getSupabaseAdmin(),
} = {}) {
  const id = normalizeWhatsappProviderMessageId(providerMessageId);
  if (!id) return { mode: 'legacy', receipt: null, leaseToken: null };
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + RECEIPT_LEASE_MINUTES * 60000).toISOString();
  const inserted = await client.from('brain_whatsapp_inbound_receipts').insert({
    user_id: userId,
    channel: 'whatsapp',
    canonical_recipient: recipient,
    provider_message_id: id,
    status: 'processing',
    lease_token: leaseToken,
    lease_expires_at: leaseExpiresAt,
  }).select('*').single();
  if (!inserted.error) return { mode: 'claimed', receipt: inserted.data, leaseToken };
  if (isMissingReliabilityTable(inserted.error)) return { mode: 'legacy', receipt: null, leaseToken: null, reason: 'migration_not_applied' };
  if (inserted.error.code !== '23505') throw inserted.error;

  const existing = await client.from('brain_whatsapp_inbound_receipts').select('*')
    .eq('user_id', userId).eq('channel', 'whatsapp').eq('canonical_recipient', recipient)
    .eq('provider_message_id', id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.status === 'completed' && existing.data.response_payload) {
    return { mode: 'replay', receipt: existing.data, response: existing.data.response_payload, leaseToken: null };
  }
  if (existing.data?.status === 'processing' && Date.parse(existing.data.lease_expires_at || '') > now.getTime()) {
    return { mode: 'processing', receipt: existing.data, leaseToken: null };
  }
  if (existing.data?.status === 'failed_before_effect') {
    const reclaimed = await client.from('brain_whatsapp_inbound_receipts').update({
      status: 'processing', lease_token: leaseToken, lease_expires_at: leaseExpiresAt, updated_at: now.toISOString(),
    }).eq('id', existing.data.id).eq('user_id', userId).eq('status', 'failed_before_effect').select('*').maybeSingle();
    if (reclaimed.error) throw reclaimed.error;
    if (reclaimed.data) return { mode: 'claimed', receipt: reclaimed.data, leaseToken };
  }
  if (existing.data?.status === 'processing') {
    await client.from('brain_whatsapp_inbound_receipts').update({
      status: 'uncertain', lease_token: null, lease_expires_at: null,
      effect_metadata: { reason: 'processing_lease_expired' }, updated_at: now.toISOString(),
    }).eq('id', existing.data.id).eq('user_id', userId).eq('status', 'processing');
  }
  return { mode: 'uncertain', receipt: existing.data, leaseToken: null };
}

export async function completeWhatsappInboundReceipt({ receiptId, leaseToken, result, userId = getActionUserId(), client = getSupabaseAdmin() } = {}) {
  if (!receiptId || !leaseToken) return null;
  const assistantMessageId = result?.persisted_message?.id ?? result?.assistant_message_id ?? null;
  const payload = sanitizeBrainMetadata({
    reply: String(result?.answer ?? '').slice(0, 8000),
    thread_id: result?.thread_id ?? null,
    assistant_message_id: assistantMessageId,
  });
  const update = await client.from('brain_whatsapp_inbound_receipts').update({
    status: 'completed',
    thread_id: result?.thread_id ?? null,
    assistant_message_id: assistantMessageId,
    response_payload: payload,
    effect_metadata: sanitizeBrainMetadata({
      action_types: (result?.actions || []).map((item) => item?.type).filter(Boolean).slice(0, 8),
      action_count: Array.isArray(result?.actions) ? result.actions.length : 0,
    }),
    lease_token: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', receiptId).eq('user_id', userId).eq('status', 'processing').eq('lease_token', leaseToken).select('*').maybeSingle();
  if (update.error) throw update.error;
  if (!update.data) throw new HttpError(409, 'WhatsApp inbound receipt lease is no longer active.');
  return update.data;
}

export async function markWhatsappInboundReceiptUncertain({ receiptId, leaseToken, error, userId = getActionUserId(), client = getSupabaseAdmin() } = {}) {
  if (!receiptId || !leaseToken) return null;
  const update = await client.from('brain_whatsapp_inbound_receipts').update({
    status: 'uncertain', lease_token: null, lease_expires_at: null,
    effect_metadata: { reason: 'brain_turn_failed_after_claim', error_class: error?.name || 'Error' },
    updated_at: new Date().toISOString(),
  }).eq('id', receiptId).eq('user_id', userId).eq('status', 'processing').eq('lease_token', leaseToken).select('id,status').maybeSingle();
  if (update.error && !isMissingReliabilityTable(update.error)) throw update.error;
  return update.data ?? null;
}

export async function markWhatsappInboundReceiptFailedBeforeEffect({ receiptId, leaseToken, error, userId = getActionUserId(), client = getSupabaseAdmin() } = {}) {
  if (!receiptId || !leaseToken) return null;
  const update = await client.from('brain_whatsapp_inbound_receipts').update({
    status: 'failed_before_effect', lease_token: null, lease_expires_at: null,
    effect_metadata: { reason: 'request_failed_before_brain_effect', error_class: error?.name || 'Error' },
    updated_at: new Date().toISOString(),
  }).eq('id', receiptId).eq('user_id', userId).eq('status', 'processing').eq('lease_token', leaseToken).select('id,status').maybeSingle();
  if (update.error && !isMissingReliabilityTable(update.error)) throw update.error;
  return update.data ?? null;
}

export async function recordWhatsappMessageDelivery({
  assistantMessageId,
  threadId,
  recipient,
  providerMessageId,
  outboxMessageId = null,
  deliveryAttempt = null,
  sentAt = null,
  userId = getActionUserId(),
  client = getSupabaseAdmin(),
} = {}) {
  const providerId = normalizeWhatsappProviderMessageId(providerMessageId);
  if (!providerId) throw new HttpError(400, 'provider_message_id is invalid.');
  const assistant = await client.from('ai_chat_messages').select('id,thread_id,role,metadata')
    .eq('id', assistantMessageId).eq('thread_id', threadId).eq('user_id', userId).eq('role', 'assistant').maybeSingle();
  if (assistant.error) throw assistant.error;
  if (!assistant.data) throw new HttpError(404, 'Assistant message not found.');
  const thread = await client.from('ai_chat_threads').select('id,metadata')
    .eq('id', threadId).eq('user_id', userId).maybeSingle();
  if (thread.error) throw thread.error;
  const threadRecipient = canonicalizeWhatsappSender(thread.data?.metadata?.whatsapp_sender);
  if (thread.data?.metadata?.source !== 'whatsapp' || threadRecipient !== recipient) {
    throw new HttpError(409, 'Assistant message does not belong to this WhatsApp recipient.');
  }

  const existing = await client.from('brain_whatsapp_message_deliveries').select('*')
    .eq('user_id', userId).eq('channel', 'whatsapp').eq('canonical_recipient', recipient)
    .eq('provider_message_id', providerId).maybeSingle();
  if (existing.error && !isMissingReliabilityTable(existing.error)) throw existing.error;
  if (existing.data) {
    if (existing.data.assistant_message_id !== assistantMessageId) throw new HttpError(409, 'Provider message is already mapped to another assistant message.');
    await activateBrainInteraction({ userId, threadId, recipient, assistantMessageId, outboxMessageId, client });
    return { row: existing.data, duplicate: true };
  }
  const inserted = await client.from('brain_whatsapp_message_deliveries').insert({
    user_id: userId, channel: 'whatsapp', canonical_recipient: recipient,
    provider_message_id: providerId, thread_id: threadId, assistant_message_id: assistantMessageId,
    outbox_message_id: outboxMessageId, delivery_attempt: deliveryAttempt,
    sent_at: sentAt || new Date().toISOString(),
  }).select('*').single();
  if (inserted.error) throw inserted.error;
  await activateBrainInteraction({ userId, threadId, recipient, assistantMessageId, outboxMessageId, client });
  return { row: inserted.data, duplicate: false };
}

export async function resolveWhatsappQuotedDelivery({ recipient, providerMessageId, userId = getActionUserId(), client = getSupabaseAdmin() } = {}) {
  const providerId = normalizeWhatsappProviderMessageId(providerMessageId);
  if (!providerId) return null;
  const delivery = await client.from('brain_whatsapp_message_deliveries').select('*')
    .eq('user_id', userId).eq('channel', 'whatsapp').eq('canonical_recipient', recipient)
    .eq('provider_message_id', providerId).maybeSingle();
  if (delivery.error) {
    if (isMissingReliabilityTable(delivery.error)) return null;
    throw delivery.error;
  }
  if (!delivery.data) return null;
  const message = await client.from('ai_chat_messages').select('id,thread_id,role,metadata,created_at')
    .eq('user_id', userId).eq('id', delivery.data.assistant_message_id).eq('role', 'assistant').maybeSingle();
  if (message.error) throw message.error;
  if (!message.data) return null;
  return { delivery: delivery.data, message: await hydrateLegacyProactiveMessage({ message: message.data, userId, client }) };
}

export async function hydrateLegacyProactiveMessage({ message, userId = getActionUserId(), client = getSupabaseAdmin() } = {}) {
  const metadata = message?.metadata;
  if (!metadata?.proactive_message || metadata.expected_reply_type !== 'accountability') return message;
  if (normalizeAccountabilityTarget(metadata.accountability)) return message;
  const outboxId = String(metadata.outbox_message_id ?? '').trim();
  if (!outboxId) return message;
  const outbox = await client.from('brain_outbox_messages').select('id,user_id,source_type,source_id,metadata,ack_metadata')
    .eq('id', outboxId).eq('user_id', userId).eq('source_type', 'accountability').maybeSingle();
  if (outbox.error) throw outbox.error;
  const target = normalizeAccountabilityTarget(outbox.data?.metadata?.accountability);
  if (!outbox.data || !target || String(outbox.data.source_id) !== String(metadata.source_id)) return message;
  const linkedAssistantId = outbox.data.ack_metadata?.assistant_message_id;
  if (linkedAssistantId && linkedAssistantId !== message.id) return message;
  return {
    ...message,
    metadata: {
      ...metadata,
      accountability: target,
      metadata_recovery: 'validated_outbox_link',
    },
  };
}

export async function setBrainInteractionPendingDelivery({
  userId = getActionUserId(), threadId, assistantMessageId, pendingAction = null,
  outboxMessageId = null, ownerPayload = {}, openedAt = new Date(), client = getSupabaseAdmin(), retry = true,
} = {}) {
  const ownerKind = pendingAction ? 'pending_action' : outboxMessageId ? 'proactive' : null;
  if (!threadId || !assistantMessageId || !ownerKind) return null;
  const expiresAt = new Date(openedAt.getTime() + INTERACTION_LEASE_MINUTES * 60000).toISOString();
  const existing = await client.from('brain_interaction_state').select('*')
    .eq('user_id', userId).eq('thread_id', threadId).eq('channel', 'whatsapp').maybeSingle();
  if (existing.error && isMissingReliabilityTable(existing.error)) return null;
  if (existing.error) throw existing.error;
  if (existing.data && Date.parse(existing.data.opened_at || '') > openedAt.getTime()) return existing.data;
  const nextVersion = Number(existing.data?.version || 0) + 1;
  const values = {
    version: Number(existing.data?.version || 0) + 1, state: 'pending_delivery', owner_kind: ownerKind,
    assistant_message_id: assistantMessageId, pending_action_id: pendingAction?.id ?? null,
    outbox_message_id: outboxMessageId, owner_payload: sanitizeBrainMetadata(ownerPayload),
    opened_at: openedAt.toISOString(), expires_at: expiresAt, updated_at: openedAt.toISOString(),
  };
  if (!existing.data) {
    const inserted = await client.from('brain_interaction_state').insert({
      user_id: userId, thread_id: threadId, channel: 'whatsapp', ...values,
    }).select('*').single();
    if (!inserted.error) return inserted.data;
    if (inserted.error.code === '23505' && retry) {
      return setBrainInteractionPendingDelivery({
        userId, threadId, assistantMessageId, pendingAction, outboxMessageId,
        ownerPayload, openedAt, client, retry: false,
      });
    }
    throw inserted.error;
  }
  const updated = await client.from('brain_interaction_state').update(values)
    .eq('user_id', userId).eq('thread_id', threadId).eq('channel', 'whatsapp')
    .eq('version', existing.data.version).select('*').maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data) {
    const current = await client.from('brain_interaction_state').select('*')
      .eq('user_id', userId).eq('thread_id', threadId).eq('channel', 'whatsapp').maybeSingle();
    if (current.error) throw current.error;
    if (current.data) return current.data;
    throw new HttpError(409, 'Brain interaction ownership changed before it could be replaced.');
  }
  if (updated.data.version !== nextVersion) throw new HttpError(409, 'Brain interaction version is invalid.');
  return updated.data;
}

export async function activateBrainInteraction({ userId = getActionUserId(), threadId, assistantMessageId, outboxMessageId = null, client = getSupabaseAdmin() } = {}) {
  const now = new Date();
  const update = await client.from('brain_interaction_state').update({
    state: 'active', opened_at: now.toISOString(),
    expires_at: new Date(now.getTime() + INTERACTION_LEASE_MINUTES * 60000).toISOString(),
    updated_at: now.toISOString(),
  }).eq('user_id', userId).eq('thread_id', threadId).eq('channel', 'whatsapp')
    .eq('assistant_message_id', assistantMessageId).eq('state', 'pending_delivery').select('*').maybeSingle();
  if (update.error && !isMissingReliabilityTable(update.error)) throw update.error;
  if (update.data) return update.data;
  if (outboxMessageId) {
    const fallback = await client.from('brain_interaction_state').update({
      state: 'active', opened_at: now.toISOString(), expires_at: new Date(now.getTime() + INTERACTION_LEASE_MINUTES * 60000).toISOString(), updated_at: now.toISOString(),
    }).eq('user_id', userId).eq('thread_id', threadId).eq('channel', 'whatsapp')
      .eq('outbox_message_id', outboxMessageId).eq('state', 'pending_delivery').select('*').maybeSingle();
    if (fallback.error && !isMissingReliabilityTable(fallback.error)) throw fallback.error;
    return fallback.data ?? null;
  }
  return null;
}

export async function loadBrainInteractionState({ threadId, userId = getActionUserId(), client = getSupabaseAdmin(), now = new Date() } = {}) {
  if (!threadId) return null;
  const result = await client.from('brain_interaction_state').select('*')
    .eq('user_id', userId).eq('thread_id', threadId).eq('channel', 'whatsapp').maybeSingle();
  if (result.error) {
    if (isMissingReliabilityTable(result.error)) return null;
    throw result.error;
  }
  if (!result.data) return null;
  if (result.data.state === 'active' && Date.parse(result.data.expires_at || '') <= now.getTime()) {
    await client.from('brain_interaction_state').update({ state: 'expired', updated_at: now.toISOString() })
      .eq('user_id', userId).eq('thread_id', threadId).eq('channel', 'whatsapp').eq('version', result.data.version);
    return { ...result.data, state: 'expired' };
  }
  return result.data;
}

export async function closeBrainInteraction({ threadId, assistantMessageId = null, expectedVersion = null, state = 'answered', userId = getActionUserId(), client = getSupabaseAdmin() } = {}) {
  if (!['answered', 'superseded', 'abandoned', 'expired'].includes(state) || !threadId) return null;
  if (!assistantMessageId && (expectedVersion === null || expectedVersion === undefined)) return null;
  let query = client.from('brain_interaction_state').update({ state, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('thread_id', threadId).eq('channel', 'whatsapp').in('state', ['active', 'pending_delivery']);
  if (assistantMessageId) query = query.eq('assistant_message_id', assistantMessageId);
  if (expectedVersion !== null && expectedVersion !== undefined) query = query.eq('version', expectedVersion);
  const result = await query.select('*').maybeSingle();
  if (result.error && !isMissingReliabilityTable(result.error)) throw result.error;
  return result.data ?? null;
}

function isMissingReliabilityTable(error) {
  return ['42P01', 'PGRST205'].includes(error?.code) || /does not exist|schema cache/i.test(String(error?.message || ''));
}
