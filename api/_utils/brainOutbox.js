import { HttpError } from './http.js';
import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import { findOrCreateWhatsappBrainThread, persistBrainAssistantMessage } from './brain.js';
import { buildProactiveWorkingContextFromOutbox } from './brainProactiveReplies.js';
import { recordWhatsappMessageDeliveries } from './brainWhatsappReliability.js';
import { normalizeAccountabilityTarget } from './brainMetadata.js';
import { canonicalizeWhatsappSender, getWhatsappSenderAliasesForCanonical } from './whatsappBridge.js';
import { checkProactiveDelivery } from './brainProactiveDelivery.js';
import {
  buildAckMetadataPatch,
  buildClaimMetadataPatch,
  buildReclaimMetadataPatch,
  canAckOutboxMessage,
  computeClaimRecovery,
  computeRetryBackoff,
  getClaimReclaimTimeoutMinutes,
  nextOutboxStatusForAck,
  normalizeAckStatus,
  normalizeOutboxPriority,
  sortOutboxRowsForDelivery,
} from './brainOutboxStateMachine.js';

const MAX_OUTBOX_LIMIT = 10;
const DEFAULT_OUTBOX_LIMIT = 3;
const MEMO_REPLY_TYPE = 'memo_done_snooze_cancel';

export {
  buildProactiveWorkingContextFromOutbox,
  computeClaimRecovery as classifyClaimedOutboxForRecovery,
  computeRetryBackoff as getOutboxRetryDelayMinutes,
  nextOutboxStatusForAck,
};

export async function enqueueOutboxMessage({
  userId = getActionUserId(),
  channel = 'whatsapp',
  recipient,
  body,
  priority = 'normal',
  ruleKey,
  sourceType = null,
  sourceId = null,
  idempotencyKey,
  scheduledFor,
  expiresAt = null,
  metadata = {},
  client = getSupabaseAdmin(),
} = {}) {
  const payload = {
    user_id: userId,
    channel: normalizeChannel(channel),
    recipient: requiredText(canonicalizeWhatsappSender(recipient), 'recipient', 180),
    body: requiredText(body, 'body', 1500),
    priority: normalizePriority(priority),
    rule_key: requiredText(ruleKey, 'ruleKey', 80),
    source_type: optionalText(sourceType, 80),
    source_id: sourceId || null,
    idempotency_key: requiredText(idempotencyKey, 'idempotencyKey', 240),
    scheduled_for: normalizeDateTime(scheduledFor, 'scheduledFor'),
    expires_at: expiresAt ? normalizeDateTime(expiresAt, 'expiresAt') : null,
    metadata: compactMetadata(metadata),
  };

  const inserted = await client
    .from('brain_outbox_messages')
    .insert(payload)
    .select(outboxSelect())
    .single();
  if (!inserted.error) {
    return { row: inserted.data, duplicate: false };
  }
  if (inserted.error.code === 'P0001' && inserted.error.message === 'attention_deferred') return { deferred: true, duplicate: false, row: null };
  if (inserted.error.code !== '23505') throw inserted.error;

  const existing = await client
    .from('brain_outbox_messages')
    .select(outboxSelect())
    .eq('user_id', userId)
    .eq('idempotency_key', payload.idempotency_key)
    .maybeSingle();
  if (existing.error) throw existing.error;
  return { row: existing.data, duplicate: true };
}

export async function pollOutboxMessages({
  recipient,
  channel = 'whatsapp',
  limit = DEFAULT_OUTBOX_LIMIT,
  bridgeId = null,
  userId = getActionUserId(),
  client = getSupabaseAdmin(),
  now = new Date().toISOString(),
} = {}) {
  const safeRecipient = requiredText(recipient, 'recipient', 180);
  const canonicalRecipient = requiredText(canonicalizeWhatsappSender(safeRecipient), 'recipient', 180);
  const recipients = recipientVariants(safeRecipient);
  const safeChannel = normalizeChannel(channel);
  const safeLimit = Math.min(MAX_OUTBOX_LIMIT, Math.max(1, Math.trunc(Number(limit)) || DEFAULT_OUTBOX_LIMIT));

  const expiredCount = await expireStaleOutboxMessages({ client, userId, recipient: canonicalRecipient, channel: safeChannel, now, recipients });
  const reclaimed = await reclaimStaleClaimedOutboxMessages({ client, userId, recipient: canonicalRecipient, channel: safeChannel, now, recipients });
  const fetchLimit = Math.min(50, Math.max(safeLimit * 4, safeLimit));

  const dueRows = [];
  for (const priority of ['high', 'normal', 'low']) {
    const due = await client
      .from('brain_outbox_messages')
      .select(outboxSelect())
      .eq('user_id', userId)
      .in('recipient', recipients)
      .eq('channel', safeChannel)
      .eq('status', 'queued')
      .eq('priority', priority)
      .lte('scheduled_for', now)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('scheduled_for', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(fetchLimit);
    if (due.error) throw due.error;
    dueRows.push(...(due.data || []));
  }

  const claimed = [];
  let cancelledCount = 0;
  let deferredCount = 0;
  for (const row of sortOutboxRowsForDelivery(dueRows)) {
    if (claimed.length >= safeLimit) break;
    const eligibility = await checkProactiveDelivery({ row, client, userId });
    if (!eligibility.eligible) {
      const cancelled = await client.from('brain_outbox_messages').update({ status: 'cancelled',
        metadata: { ...row.metadata, delivery_revalidation: { reason: eligibility.reason, cancelled_at: now } },
      }).eq('user_id', userId).eq('id', row.id).eq('status', 'queued');
      if (cancelled.error) throw cancelled.error;
      cancelledCount++;
      continue;
    }
    const update = await client
      .from('brain_outbox_messages')
      .update({
        status: 'claimed',
        claimed_at: now,
        attempts: Number(row.attempts ?? 0) + 1,
        ack_metadata: buildClaimMetadataPatch({
          existingMetadata: row.ack_metadata,
          bridgeId: optionalText(bridgeId, 120),
          now,
        }),
      })
      .eq('id', row.id)
      .eq('user_id', userId)
      .eq('status', 'queued')
      .select(outboxSelect())
      .maybeSingle();
    if (update.error) throw update.error;
    if (update.data) claimed.push(update.data);
    else deferredCount++;
  }

  Object.defineProperty(claimed, 'diagnostics', {
    value: {
      outbox_claimed_count: claimed.length,
      outbox_reclaimed_count: reclaimed.length,
      outbox_expired_count: expiredCount,
      outbox_revalidation_cancelled_count: cancelledCount,
      outbox_claim_deferred_count: deferredCount,
    },
    enumerable: false,
  });
  return claimed;
}

export async function reclaimStaleClaimedOutboxMessages({
  client = getSupabaseAdmin(),
  userId = getActionUserId(),
  recipient,
  recipients = null,
  channel = 'whatsapp',
  now = new Date().toISOString(),
} = {}) {
  const safeRecipient = requiredText(recipient, 'recipient', 180);
  const recipientList = Array.isArray(recipients) && recipients.length ? recipients : recipientVariants(safeRecipient);
  const safeChannel = normalizeChannel(channel);
  const nowDate = normalizeDate(now);
  const cutoff = new Date(nowDate.getTime() - getClaimReclaimTimeoutMinutes() * 60000).toISOString();
  const result = await client
    .from('brain_outbox_messages')
    .select(outboxSelect())
    .eq('user_id', userId)
    .in('recipient', recipientList)
    .eq('channel', safeChannel)
    .eq('status', 'claimed')
    .is('sent_at', null)
    .or(`claimed_at.is.null,claimed_at.lte.${cutoff}`)
    .limit(50);
  if (result.error) throw result.error;

  const reclaimed = [];
  for (const row of result.data ?? []) {
    const decision = computeClaimRecovery(row, nowDate);
    if (decision.action === 'keep') continue;
    const update = await client
      .from('brain_outbox_messages')
      .update(buildClaimRecoveryUpdate(row, decision, nowDate))
      .eq('id', row.id)
      .eq('user_id', userId)
      .eq('status', 'claimed')
      .eq('attempts', row.attempts)
      .is('sent_at', null)
      .select(outboxSelect())
      .maybeSingle();
    if (update.error) throw update.error;
    if (update.data) reclaimed.push(update.data);
  }
  return reclaimed;
}

export async function ackOutboxMessage({
  messageId,
  recipient,
  channel = 'whatsapp',
  status,
  error = null,
  metadata = {},
  userId = getActionUserId(),
  deliveryAttempt = null,
} = {}) {
  const safeStatus = normalizeAckStatus(status);
  if (!safeStatus) throw new HttpError(400, 'status must be sent or failed.');
  const safeRecipient = requiredText(recipient, 'recipient', 180);
  const canonicalRecipient = requiredText(canonicalizeWhatsappSender(safeRecipient), 'recipient', 180);
  const recipients = recipientVariants(safeRecipient);
  const safeChannel = normalizeChannel(channel);
  const id = requiredText(messageId, 'message_id', 80);
  const client = getSupabaseAdmin();

  const current = await client
    .from('brain_outbox_messages')
    .select(outboxSelect())
    .eq('id', id)
    .eq('user_id', userId)
    .in('recipient', recipients)
    .eq('channel', safeChannel)
    .maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw new HttpError(404, 'Outbox message not found.');
  if (deliveryAttempt != null && Number(deliveryAttempt) !== current.data.attempts) throw new HttpError(409, 'Stale delivery attempt.');

  if (safeStatus === 'sent') {
    const sent = await markOutboxSent({ client, row: current.data, metadata });
    const persisted = await persistSentProactiveMessageToWhatsappThread({
      userId,
      recipient: canonicalRecipient,
      outboxMessage: sent,
      client,
    });
    if (persisted?.id && (metadata?.provider_message_id || metadata?.provider_message_ids?.length)) {
      await recordWhatsappMessageDeliveries({
        userId,
        assistantMessageId: persisted.id,
        threadId: persisted.thread_id,
        recipient: canonicalRecipient,
        providerMessageId: metadata.provider_message_id,
        providerMessageIds: metadata.provider_message_ids,
        outboxMessageId: sent.id,
        deliveryAttempt: sent.attempts,
        sentAt: sent.sent_at,
        client,
      });
    }
    if (persisted?.id && !sent.ack_metadata?.assistant_message_id) {
      const withAssistant = await client
        .from('brain_outbox_messages')
        .update({
          ack_metadata: {
            ...(sent.ack_metadata && typeof sent.ack_metadata === 'object' ? sent.ack_metadata : {}),
            assistant_message_id: persisted.id,
          },
        })
        .eq('id', sent.id)
        .eq('user_id', userId)
        .select(outboxSelect())
        .single();
      if (withAssistant.error) throw withAssistant.error;
      return withAssistant.data;
    }
    return sent;
  }

  return markOutboxFailed({ client, row: current.data, error, metadata });
}

export async function persistSentProactiveMessageToWhatsappThread({
  userId = getActionUserId(), recipient, outboxMessage, client = getSupabaseAdmin(),
  findThread = findOrCreateWhatsappBrainThread, persistMessage = persistBrainAssistantMessage,
} = {}) {
  if (!outboxMessage?.id || outboxMessage.status !== 'sent') return null;
  const canonicalRecipient = requiredText(canonicalizeWhatsappSender(recipient), 'recipient', 180);
  const thread = await findThread({ sender: canonicalRecipient });
  if (!thread?.id) return null;
  const existing = await findExistingProactiveAssistantMessage({ userId, threadId: thread.id, outboxMessageId: outboxMessage.id, client });
  if (existing) return existing;
  const metadata = outboxMessage.metadata && typeof outboxMessage.metadata === 'object' ? outboxMessage.metadata : {};
  const chat = {
    thread,
    source: 'whatsapp',
    channelMetadata: {
      whatsapp_sender: canonicalRecipient,
      whatsapp_message_id: `outbox:${outboxMessage.id}`,
    },
    assistantPersisted: false,
  };
  const workingContext = buildProactiveWorkingContextFromOutbox(outboxMessage);
  try {
    return await persistMessage({
      chat,
      answer: outboxMessage.body,
      actionType: null,
      actions: [],
      recordRefs: [],
      workingContext,
      extraMetadata: proactiveAssistantMetadata(outboxMessage),
      client,
      userId,
    });
  } catch (error) {
    if (error?.code !== '23505') throw error;
    const concurrent = await findExistingProactiveAssistantMessage({ userId, threadId: thread.id, outboxMessageId: outboxMessage.id, client });
    if (concurrent) return concurrent;
    throw error;
  }
}

export function proactiveAssistantMetadata(outboxMessage) {
  const metadata = outboxMessage.metadata || {};
  const accountability = normalizeAccountabilityTarget(metadata.accountability);
  return {
    metadata_version: 2,
    proactive_message: true,
    outbox_message_id: outboxMessage.id,
    rule_key: outboxMessage.rule_key,
    source_type: outboxMessage.source_type,
    source_id: outboxMessage.source_id,
    expected_reply_type: metadata.expected_reply_type || MEMO_REPLY_TYPE,
    ...(metadata.language ? { language: metadata.language } : {}),
    ...(accountability ? { accountability } : {}),
  };
}

async function findExistingProactiveAssistantMessage({ userId, threadId, outboxMessageId, client = getSupabaseAdmin() }) {
  const result = await client
    .from('ai_chat_messages')
    .select('id, thread_id, role, content, request_id, action_type, metadata, created_at')
    .eq('user_id', userId)
    .eq('thread_id', threadId)
    .eq('role', 'assistant')
    .contains('metadata', {
      proactive_message: true,
      outbox_message_id: outboxMessageId,
    })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ?? null;
}

export async function markOutboxSent({ client, row, metadata = {} }) {
  const permission = canAckOutboxMessage({ row, ackStatus: 'sent' });
  if (permission.idempotent) return row;
  if (!permission.allowed) throw new HttpError(409, `Cannot mark outbox message as sent from status ${row.status}.`);
  const now = new Date().toISOString();
  const update = await client
    .from('brain_outbox_messages')
    .update({
      status: 'sent',
      sent_at: row.sent_at || now,
      failed_at: null,
      last_error: null,
      ack_metadata: buildAckMetadataPatch({
        existingMetadata: row.ack_metadata,
        metadata: compactMetadata(metadata),
        now,
        transition: permission.transition,
      }),
    })
    .eq('id', row.id)
    .eq('user_id', row.user_id)
    .eq('status', 'claimed')
    .eq('attempts', row.attempts)
    .select(outboxSelect())
    .maybeSingle();
  if (update.error) throw update.error;
  if (!update.data) throw new HttpError(409, 'Outbox claim changed before ACK.');
  return update.data;
}

async function markOutboxFailed({ client, row, error, metadata = {} }) {
  const permission = canAckOutboxMessage({ row, ackStatus: 'failed' });
  if (!permission.allowed) throw new HttpError(409, `Cannot mark outbox message as failed from status ${row.status}.`);
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const expired = Boolean(row.expires_at && new Date(row.expires_at) <= nowDate);
  const next = nextOutboxStatusForAck({ currentAttempts: row.attempts, ackStatus: 'failed', expired });
  const retryDelay = next.retry ? computeRetryBackoff(row.attempts) : 0;
  const retryAfter = next.retry ? new Date(nowDate.getTime() + retryDelay * 60000).toISOString() : null;
  const update = await client
    .from('brain_outbox_messages')
    .update({
      status: next.status,
      claimed_at: null,
      scheduled_for: retryAfter || row.scheduled_for,
      failed_at: next.status === 'failed' ? now : null,
      last_error: optionalText(error, 500),
      ack_metadata: buildAckMetadataPatch({
        existingMetadata: row.ack_metadata,
        metadata: compactMetadata(metadata),
        now,
        transition: `claimed->${next.status}`,
        retry: next.retry,
        retryAfter,
        retryDelayMinutes: retryDelay,
      }),
    })
    .eq('id', row.id)
    .eq('user_id', row.user_id)
    .eq('status', 'claimed')
    .eq('attempts', row.attempts)
    .select(outboxSelect())
    .maybeSingle();
  if (update.error) throw update.error;
  if (!update.data) throw new HttpError(409, 'Outbox claim changed before ACK.');
  return update.data;
}

async function expireStaleOutboxMessages({ client, userId, recipient, recipients = null, channel, now }) {
  const recipientList = Array.isArray(recipients) && recipients.length ? recipients : recipientVariants(recipient);
  const result = await client
    .from('brain_outbox_messages')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .in('recipient', recipientList)
    .eq('channel', channel)
    .eq('status', 'queued')
    .not('expires_at', 'is', null)
    .lte('expires_at', now)
    .select('id');
  if (result.error) throw result.error;
  return result.data?.length ?? 0;
}

function buildClaimRecoveryUpdate(row, decision, nowDate) {
  const nowIso = nowDate.toISOString();
  const baseMetadata = buildReclaimMetadataPatch({
    existingMetadata: row.ack_metadata,
    row,
    decision,
    now: nowDate,
  });
  if (decision.action === 'expire') {
    return {
      status: 'expired',
      claimed_at: null,
      ack_metadata: baseMetadata,
    };
  }
  if (decision.action === 'fail') {
    return {
      status: 'failed',
      claimed_at: null,
      failed_at: nowIso,
      last_error: 'Claim expired after maximum delivery attempts.',
      ack_metadata: baseMetadata,
    };
  }
  return {
    status: 'queued',
    claimed_at: null,
    scheduled_for: decision.scheduled_for || nowIso,
    ack_metadata: baseMetadata,
  };
}

function outboxSelect() {
  return 'id, user_id, channel, recipient, body, status, priority, rule_key, source_type, source_id, idempotency_key, scheduled_for, expires_at, claimed_at, sent_at, failed_at, attempts, last_error, ack_metadata, metadata, created_at, updated_at';
}

function normalizeChannel(value) {
  const text = String(value ?? 'whatsapp').trim().toLowerCase();
  if (text === 'whatsapp') return text;
  throw new HttpError(400, 'Only whatsapp outbox messages are supported.');
}

function normalizePriority(value) {
  return normalizeOutboxPriority(value);
}

function normalizeDateTime(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `${field} must be a valid datetime.`);
  return date.toISOString();
}

function normalizeDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function requiredText(value, field, max = 1000) {
  const text = optionalText(value, max);
  if (!text) throw new HttpError(400, `${field} is required.`);
  return text;
}

function optionalText(value, max = 1000) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function recipientVariants(value) {
  const raw = requiredText(value, 'recipient', 180);
  const canonical = requiredText(canonicalizeWhatsappSender(raw), 'recipient', 180);
  return [...new Set([...getWhatsappSenderAliasesForCanonical(canonical), raw].filter(Boolean))];
}

function compactMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return sanitizeObject(value, 0);
}

function sanitizeObject(value, depth) {
  if (depth > 4) return '[truncated]';
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 1000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeObject(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => {
      if (/secret|token|password|authorization|api[_-]?key/i.test(key)) return [key, '[redacted]'];
      return [key, sanitizeObject(item, depth + 1)];
    }));
  }
  return String(value).slice(0, 500);
}
