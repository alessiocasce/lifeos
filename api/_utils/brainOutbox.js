import { HttpError } from './http.js';
import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import { findOrCreateWhatsappBrainThread, persistBrainAssistantMessage } from './brain.js';
import { localDateTime, addDays } from './date.js';

const MAX_OUTBOX_LIMIT = 10;
const DEFAULT_OUTBOX_LIMIT = 3;
const MAX_ATTEMPTS = 3;
const MEMO_REPLY_TYPE = 'memo_done_snooze_cancel';

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
} = {}) {
  const payload = {
    user_id: userId,
    channel: normalizeChannel(channel),
    recipient: requiredText(recipient, 'recipient', 180),
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

  const client = getSupabaseAdmin();
  const inserted = await client
    .from('brain_outbox_messages')
    .insert(payload)
    .select(outboxSelect())
    .single();
  if (!inserted.error) {
    return { row: inserted.data, duplicate: false };
  }
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
} = {}) {
  const safeRecipient = requiredText(recipient, 'recipient', 180);
  const safeChannel = normalizeChannel(channel);
  const safeLimit = Math.min(MAX_OUTBOX_LIMIT, Math.max(1, Math.trunc(Number(limit)) || DEFAULT_OUTBOX_LIMIT));
  const client = getSupabaseAdmin();
  const now = new Date().toISOString();

  await expireStaleOutboxMessages({ client, userId, recipient: safeRecipient, channel: safeChannel, now });

  const due = await client
    .from('brain_outbox_messages')
    .select(outboxSelect())
    .eq('user_id', userId)
    .eq('recipient', safeRecipient)
    .eq('channel', safeChannel)
    .eq('status', 'queued')
    .lte('scheduled_for', now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('priority', { ascending: false })
    .order('scheduled_for', { ascending: true })
    .limit(safeLimit);
  if (due.error) throw due.error;

  const claimed = [];
  for (const row of due.data ?? []) {
    const update = await client
      .from('brain_outbox_messages')
      .update({
        status: 'claimed',
        claimed_at: now,
        attempts: Number(row.attempts ?? 0) + 1,
        ack_metadata: {
          ...(row.ack_metadata && typeof row.ack_metadata === 'object' ? row.ack_metadata : {}),
          bridge_id: optionalText(bridgeId, 120),
          claimed_at: now,
        },
      })
      .eq('id', row.id)
      .eq('user_id', userId)
      .eq('status', 'queued')
      .select(outboxSelect())
      .maybeSingle();
    if (update.error) throw update.error;
    if (update.data) claimed.push(update.data);
  }

  return claimed;
}

export async function ackOutboxMessage({
  messageId,
  recipient,
  channel = 'whatsapp',
  status,
  error = null,
  metadata = {},
  userId = getActionUserId(),
} = {}) {
  const safeStatus = normalizeAckStatus(status);
  const safeRecipient = requiredText(recipient, 'recipient', 180);
  const safeChannel = normalizeChannel(channel);
  const id = requiredText(messageId, 'message_id', 80);
  const client = getSupabaseAdmin();

  const current = await client
    .from('brain_outbox_messages')
    .select(outboxSelect())
    .eq('id', id)
    .eq('user_id', userId)
    .eq('recipient', safeRecipient)
    .eq('channel', safeChannel)
    .maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw new HttpError(404, 'Outbox message not found.');

  if (safeStatus === 'sent') {
    const sent = await markOutboxSent({ client, row: current.data, metadata });
    const persisted = await persistSentProactiveMessageToWhatsappThread({
      userId,
      recipient: safeRecipient,
      outboxMessage: sent,
    });
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

export async function persistSentProactiveMessageToWhatsappThread({ userId = getActionUserId(), recipient, outboxMessage } = {}) {
  if (!outboxMessage?.id || outboxMessage.status !== 'sent') return null;
  if (outboxMessage.ack_metadata?.assistant_message_id) return null;
  const thread = await findOrCreateWhatsappBrainThread({ sender: recipient });
  if (!thread?.id) return null;
  const metadata = outboxMessage.metadata && typeof outboxMessage.metadata === 'object' ? outboxMessage.metadata : {};
  const chat = {
    thread,
    source: 'whatsapp',
    channelMetadata: {
      whatsapp_sender: recipient,
      whatsapp_message_id: `outbox:${outboxMessage.id}`,
    },
    assistantPersisted: false,
  };
  const workingContext = buildProactiveWorkingContextFromOutbox(outboxMessage);
  return persistBrainAssistantMessage({
    chat,
    answer: outboxMessage.body,
    actionType: null,
    actions: [],
    recordRefs: [],
    workingContext,
    extraMetadata: {
      proactive_message: true,
      outbox_message_id: outboxMessage.id,
      rule_key: outboxMessage.rule_key,
      source_type: outboxMessage.source_type,
      source_id: outboxMessage.source_id,
      expected_reply_type: metadata.expected_reply_type || MEMO_REPLY_TYPE,
    },
  });
}

export async function resolveProactiveMemoReply({ message, brainChat, context } = {}) {
  const proactive = extractLatestProactiveMemoMessage(brainChat);
  if (!proactive) return null;
  const intent = normalizeProactiveMemoReply(message);
  if (intent.intent === 'other') return null;

  const memoId = proactive.source_id;
  if (!memoId) {
    return buildProactiveReplyResult({
      answer: proactive.language === 'it'
        ? 'Mi manca il riferimento al promemoria. Apri Memos per aggiornarlo.'
        : 'I am missing the reminder reference. Open Memos to update it.',
      actionType: 'proactive_memo_unresolved',
      data: { reason: 'missing_source_id' },
      workingContext: proactive.working_context,
    });
  }

  if (intent.intent === 'explain') {
    return {
      answer: proactive.language === 'it'
        ? `Te l'ho scritto per questo promemoria: ${proactive.title}.`
        : `I texted you for this reminder: ${proactive.title}.`,
      plan: createProactiveReadOnlyPlan('Explain proactive memo reminder.'),
      actions: [],
      contextSummary: null,
      working_context: proactive.working_context,
      skipMemoryExtraction: true,
    };
  }

  if (intent.intent === 'done') {
    const memo = await updateMemoStatus({ memoId, status: 'done' });
    const answer = proactive.language === 'it'
      ? `Fatto. Ho segnato il promemoria come completato: ${memo.title}.`
      : `Done. I marked the reminder complete: ${memo.title}.`;
    return buildProactiveReplyResult({
      answer,
      actionType: 'update_memo_status',
      data: memo,
      workingContext: buildMemoWorkingContext({ memo, language: proactive.language, actionType: 'update_memo_status', answer }),
    });
  }

  if (intent.intent === 'cancel') {
    const memo = await updateMemoStatus({ memoId, status: 'dismissed' });
    const answer = proactive.language === 'it'
      ? `Ricevuto. Ho annullato il promemoria: ${memo.title}.`
      : `Got it. I dismissed the reminder: ${memo.title}.`;
    await cancelQueuedOutboxForMemo({ memoId });
    return buildProactiveReplyResult({
      answer,
      actionType: 'dismiss_memo',
      data: memo,
      workingContext: buildMemoWorkingContext({ memo, language: proactive.language, actionType: 'dismiss_memo', answer }),
    });
  }

  if (intent.intent === 'snooze') {
    const target = resolveSnoozeTarget({ intent, language: proactive.language });
    if (!target) {
      return {
        answer: proactive.language === 'it'
          ? 'Che orario devo usare per ricordartelo piu tardi?'
          : 'What time should I use to remind you later?',
        plan: createProactiveReadOnlyPlan('Ask for memo snooze time.'),
        actions: [],
        contextSummary: null,
        working_context: proactive.working_context,
        skipMemoryExtraction: true,
      };
    }
    const memo = await rescheduleMemo({ memoId, memoDate: target.memo_date, memoTime: target.memo_time });
    await cancelQueuedOutboxForMemo({ memoId });
    const answer = proactive.language === 'it'
      ? `Ok, te lo ricordo ${formatMemoDateTime(target.memo_date, target.memo_time)}.`
      : `Ok, I will remind you ${formatMemoDateTime(target.memo_date, target.memo_time)}.`;
    return buildProactiveReplyResult({
      answer,
      actionType: 'snooze_memo',
      data: memo,
      workingContext: buildMemoWorkingContext({ memo, language: proactive.language, actionType: 'snooze_memo', answer }),
    });
  }

  return null;
}

export function extractLatestProactiveMemoMessage(brainChat) {
  const history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item?.role !== 'assistant') continue;
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    if (!metadata.proactive_message || metadata.expected_reply_type !== MEMO_REPLY_TYPE) continue;
    const workingContext = metadata.working_context && typeof metadata.working_context === 'object' ? metadata.working_context : {};
    const subject = workingContext.last_subject && typeof workingContext.last_subject === 'object' ? workingContext.last_subject : {};
    return {
      message_id: item.id,
      outbox_message_id: metadata.outbox_message_id,
      source_id: metadata.source_id || subject.id,
      source_type: metadata.source_type || subject.source_type || 'memo',
      title: subject.label || metadata.memo_title || item.content || 'Memo',
      language: workingContext.language === 'en' ? 'en' : 'it',
      working_context: workingContext,
    };
  }
  return null;
}

export function normalizeProactiveMemoReply(message) {
  const text = normalizeText(message);
  if (!text) return { intent: 'other', confidence: 0, normalized: text };
  if (/^(?:\?|cosa\??|perche\??|why\??|what\??|non ho capito\??|spiega|explain)$/.test(text)) {
    return { intent: 'explain', confidence: 0.9, normalized: text };
  }
  if (/\b(?:annulla|cancella|non ricordarmelo|non farlo|dismiss|cancel|stop|forget it)\b/.test(text)) {
    return { intent: 'cancel', confidence: 0.95, normalized: text };
  }
  if (/\b(?:snooze|rimanda|posticipa|piu tardi|piu avanti|tra \d+|fra \d+|later|tomorrow|domani|alle \d|at \d)\b/.test(text) || looksLikeTimeOnly(text)) {
    return { intent: 'snooze', confidence: 0.86, normalized: text, minutes: extractSnoozeMinutes(text), time: extractTime(text), tomorrow: /\b(?:domani|tomorrow)\b/.test(text) };
  }
  if (/^(?:si|s|yes|y|ok|okay|fatto|done|completato|completa|completed|ce l ho|ce lho|gia fatto|gia|esatto)$/.test(text)
    || /\b(?:fatto|done|completato|completed|mark done|segna completato)\b/.test(text)) {
    return { intent: 'done', confidence: 0.9, normalized: text };
  }
  return { intent: 'other', confidence: 0.2, normalized: text };
}

export function nextOutboxStatusForAck({ currentAttempts = 0, ackStatus, expired = false } = {}) {
  if (ackStatus === 'sent') return { status: 'sent', retry: false };
  if (expired) return { status: 'failed', retry: false };
  if (Number(currentAttempts ?? 0) < MAX_ATTEMPTS) return { status: 'queued', retry: true };
  return { status: 'failed', retry: false };
}

export function buildProactiveWorkingContextFromOutbox(outboxMessage) {
  const metadata = outboxMessage?.metadata && typeof outboxMessage.metadata === 'object' ? outboxMessage.metadata : {};
  const memo = metadata.memo && typeof metadata.memo === 'object' ? metadata.memo : {};
  const language = metadata.language === 'en' ? 'en' : 'it';
  return {
    language,
    last_subject: {
      id: outboxMessage.source_id || memo.id || null,
      type: 'memo',
      label: memo.title || outboxMessage.body || 'Memo',
      date: memo.memo_date || null,
      start_time: memo.memo_time || null,
      source: 'proactive_whatsapp_memo',
      source_type: outboxMessage.source_type || 'memo',
      source_id: outboxMessage.source_id || memo.id || null,
      due_at: metadata.due_at || outboxMessage.scheduled_for || null,
      created_by_last_action: false,
      confidence: 0.95,
      raw: {
        outbox_message_id: outboxMessage.id,
        rule_key: outboxMessage.rule_key,
        expected_reply_type: metadata.expected_reply_type || MEMO_REPLY_TYPE,
      },
    },
    last_action_result: null,
  };
}

function buildProactiveReplyResult({ answer, actionType, data, workingContext }) {
  return {
    answer,
    plan: {
      intent: actionType,
      needsRead: false,
      needsWrite: true,
      riskLevel: 'low',
      args: { id: data?.id },
      reasoning: 'Resolved contextual proactive memo reply.',
    },
    actions: [{
      type: actionType,
      data: {
        ...data,
        sourcePath: 'proactive_whatsapp_reply',
      },
    }],
    contextSummary: null,
    working_context: workingContext,
    skipMemoryExtraction: true,
  };
}

function createProactiveReadOnlyPlan(reason) {
  return {
    intent: 'clarify',
    needsRead: false,
    needsWrite: false,
    riskLevel: 'low',
    args: {},
    reasoning: reason,
  };
}

async function markOutboxSent({ client, row, metadata = {} }) {
  if (row.status === 'sent') return row;
  const now = new Date().toISOString();
  const update = await client
    .from('brain_outbox_messages')
    .update({
      status: 'sent',
      sent_at: row.sent_at || now,
      failed_at: null,
      last_error: null,
      ack_metadata: {
        ...(row.ack_metadata && typeof row.ack_metadata === 'object' ? row.ack_metadata : {}),
        ...compactMetadata(metadata),
        acked_at: now,
      },
    })
    .eq('id', row.id)
    .eq('user_id', row.user_id)
    .in('status', ['claimed', 'queued', 'sent'])
    .select(outboxSelect())
    .single();
  if (update.error) throw update.error;
  return update.data;
}

async function markOutboxFailed({ client, row, error, metadata = {} }) {
  const now = new Date().toISOString();
  const expired = Boolean(row.expires_at && new Date(row.expires_at) <= new Date());
  const next = nextOutboxStatusForAck({ currentAttempts: row.attempts, ackStatus: 'failed', expired });
  const update = await client
    .from('brain_outbox_messages')
    .update({
      status: next.status,
      failed_at: next.status === 'failed' ? now : null,
      last_error: optionalText(error, 500),
      ack_metadata: {
        ...(row.ack_metadata && typeof row.ack_metadata === 'object' ? row.ack_metadata : {}),
        ...compactMetadata(metadata),
        last_failed_at: now,
        retry: next.retry,
      },
    })
    .eq('id', row.id)
    .eq('user_id', row.user_id)
    .select(outboxSelect())
    .single();
  if (update.error) throw update.error;
  return update.data;
}

async function expireStaleOutboxMessages({ client, userId, recipient, channel, now }) {
  const result = await client
    .from('brain_outbox_messages')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('recipient', recipient)
    .eq('channel', channel)
    .eq('status', 'queued')
    .not('expires_at', 'is', null)
    .lte('expires_at', now);
  if (result.error) throw result.error;
}

async function updateMemoStatus({ memoId, status }) {
  const result = await getSupabaseAdmin()
    .from('memos')
    .update({ status })
    .eq('id', memoId)
    .eq('user_id', getActionUserId())
    .select('id, title, memo_date, memo_time, status, notes, updated_at')
    .single();
  if (result.error) throw result.error;
  return result.data;
}

async function rescheduleMemo({ memoId, memoDate, memoTime }) {
  const result = await getSupabaseAdmin()
    .from('memos')
    .update({ memo_date: memoDate, memo_time: memoTime, status: 'open' })
    .eq('id', memoId)
    .eq('user_id', getActionUserId())
    .select('id, title, memo_date, memo_time, status, notes, updated_at')
    .single();
  if (result.error) throw result.error;
  return result.data;
}

async function cancelQueuedOutboxForMemo({ memoId }) {
  const result = await getSupabaseAdmin()
    .from('brain_outbox_messages')
    .update({ status: 'cancelled' })
    .eq('user_id', getActionUserId())
    .eq('source_type', 'memo')
    .eq('source_id', memoId)
    .in('status', ['queued', 'claimed']);
  if (result.error) throw result.error;
}

function resolveSnoozeTarget({ intent, language }) {
  if (intent.minutes) {
    const local = localDateTime(Number(intent.minutes));
    return { memo_date: local.date, memo_time: local.time };
  }
  if (intent.time) {
    const nowLocal = localDateTime(0);
    let date = intent.tomorrow ? addDays(nowLocal.date, 1) : nowLocal.date;
    if (!intent.tomorrow && intent.time <= nowLocal.time) date = addDays(nowLocal.date, 1);
    return { memo_date: date, memo_time: intent.time };
  }
  if (intent.tomorrow) {
    return { memo_date: addDays(localDateTime(0).date, 1), memo_time: '09:00' };
  }
  if (intent.normalized.includes('piu tardi') || intent.normalized.includes('later')) {
    const local = localDateTime(60);
    return { memo_date: local.date, memo_time: local.time };
  }
  return language === 'it' ? null : null;
}

function buildMemoWorkingContext({ memo, language, actionType, answer }) {
  return {
    language: language === 'en' ? 'en' : 'it',
    last_subject: {
      id: memo.id,
      type: 'memo',
      label: memo.title,
      date: memo.memo_date,
      start_time: memo.memo_time,
      source: 'memo',
      created_by_last_action: true,
      confidence: 0.95,
      raw: { status: memo.status },
    },
    last_action_result: {
      action_type: actionType,
      status: 'success',
      summary: answer,
      args: { id: memo.id },
      result: { id: memo.id, status: memo.status, memo_date: memo.memo_date, memo_time: memo.memo_time },
      created_at: new Date().toISOString(),
    },
  };
}

function formatMemoDateTime(date, time) {
  return [date, time].filter(Boolean).join(' alle ');
}

function extractSnoozeMinutes(text) {
  const match = text.match(/\b(?:snooze|tra|fra|in|later)\s+(\d{1,3})\b/) || text.match(/\b(\d{1,3})\s*(?:m|min|minutes|minuti)\b/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 && value <= 720 ? value : null;
}

function extractTime(text) {
  const match = text.match(/\b(?:alle|at)?\s*(\d{1,2})(?::|\.| )?(\d{2})?\s*(am|pm)?\b/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const suffix = match[3];
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;
  if (suffix === 'pm' && hours < 12) hours += 12;
  if (suffix === 'am' && hours === 12) hours = 0;
  if (hours < 0 || hours > 23) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function looksLikeTimeOnly(text) {
  return /^(?:alle\s+|at\s+)?\d{1,2}(?::|\.| )?\d{0,2}\s*(?:am|pm)?$/.test(text);
}

function outboxSelect() {
  return 'id, user_id, channel, recipient, body, status, priority, rule_key, source_type, source_id, idempotency_key, scheduled_for, expires_at, claimed_at, sent_at, failed_at, attempts, last_error, ack_metadata, metadata, created_at, updated_at';
}

function normalizeAckStatus(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'sent' || text === 'failed') return text;
  throw new HttpError(400, 'status must be sent or failed.');
}

function normalizeChannel(value) {
  const text = String(value ?? 'whatsapp').trim().toLowerCase();
  if (text === 'whatsapp') return text;
  throw new HttpError(400, 'Only whatsapp outbox messages are supported.');
}

function normalizePriority(value) {
  const text = String(value ?? 'normal').trim().toLowerCase();
  return ['low', 'normal', 'high'].includes(text) ? text : 'normal';
}

function normalizeDateTime(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `${field} must be a valid datetime.`);
  return date.toISOString();
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

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s:?'.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
