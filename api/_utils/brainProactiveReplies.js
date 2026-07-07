import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import { localDateTime, addDays } from './date.js';
import { normalizeTurnText } from './brainTurnArbitration.js';
import {
  ACCOUNTABILITY_REPLY_TYPE,
  buildAccountabilityWorkingContextFromOutbox,
  normalizeProactiveAccountabilityReply,
  resolveProactiveAccountabilityReply,
  selectProactiveAccountabilityReplyTarget,
} from './brainProactiveAccountability.js';

const MEMO_REPLY_TYPE = 'memo_done_snooze_cancel';
const PROACTIVE_REPLY_DEFAULT_WINDOW_HOURS = 6;
const PROACTIVE_REPLY_OVERDUE_WINDOW_HOURS = 36;

export async function resolveProactiveWhatsappReply({ message, brainChat, context } = {}) {
  const target = selectProactiveReplyTarget({ message, brainChat, now: new Date() });
  let result = null;
  if (target.reply_type === ACCOUNTABILITY_REPLY_TYPE) {
    result = await resolveProactiveAccountabilityReply({ message, brainChat, context });
  } else if (target.reply_type === MEMO_REPLY_TYPE) {
    result = await resolveProactiveMemoReply({ message, brainChat, context });
  }
  if (!result) return null;
  return {
    ...result,
    proactive_reply_trace: {
      handled: true,
      expected_reply_type: result.proactive_reply_trace?.expected_reply_type ?? target.reply_type ?? null,
      action_type: result.proactive_reply_trace?.action_type ?? result.actions?.[0]?.type ?? null,
      reason: result.plan?.reasoning ?? null,
      stale: result.proactive_reply_trace?.stale ?? false,
      ambiguous: result.proactive_reply_trace?.ambiguous ?? false,
    },
  };
}

export function shouldPrioritizeProactiveReplyOverPending({ message, brainChat, activePendingAction, now = new Date() } = {}) {
  if (!activePendingAction) return { prioritize: false, reason: 'no_pending_action', intent: 'other' };
  const selection = selectProactiveReplyTarget({ message, brainChat, now });
  const intent = selection.intent?.intent ?? 'other';
  if (intent === 'other' || selection.type === 'none') {
    return { prioritize: false, reason: 'no_proactive_reply_intent', intent };
  }
  if (messageReferencesPendingAction(message, activePendingAction)) {
    return { prioritize: false, reason: 'message_references_pending_action', intent };
  }
  if (intent === 'cancel' && !messageReferencesProactiveTarget(message, selection.proactive)) {
    return { prioritize: false, reason: 'generic_cancel_kept_for_pending_action', intent };
  }
  return {
    prioritize: true,
    reason: selection.type === 'stale'
      ? 'stale_proactive_context_needs_clarification'
      : selection.type === 'ambiguous'
        ? 'ambiguous_proactive_context_needs_clarification'
        : 'latest_proactive_reply_intent',
    intent,
    selection_type: selection.type,
    reply_type: selection.reply_type ?? null,
  };
}

export function selectProactiveReplyTarget({ message, brainChat, now = new Date() } = {}) {
  const latestType = getLatestProactiveReplyType(brainChat);
  if (latestType === ACCOUNTABILITY_REPLY_TYPE) {
    const accountability = selectProactiveAccountabilityReplyTarget({ message, brainChat, now });
    if (accountability.type !== 'none') return { ...accountability, reply_type: ACCOUNTABILITY_REPLY_TYPE };
  }
  if (latestType === MEMO_REPLY_TYPE) {
    const memo = selectProactiveMemoReplyTarget({ message, brainChat, now });
    if (memo.type !== 'none') return { ...memo, reply_type: MEMO_REPLY_TYPE };
  }

  const memo = selectProactiveMemoReplyTarget({ message, brainChat, now });
  if (memo.type !== 'none') return { ...memo, reply_type: MEMO_REPLY_TYPE };
  const accountability = selectProactiveAccountabilityReplyTarget({ message, brainChat, now });
  if (accountability.type !== 'none') return { ...accountability, reply_type: ACCOUNTABILITY_REPLY_TYPE };
  return { type: 'none', intent: { intent: 'other', confidence: 0 }, reply_type: null };
}

function messageReferencesProactiveTarget(message, proactive) {
  const text = normalizeTurnText(message);
  if (!text || !proactive) return false;
  const title = normalizeTurnText(proactive.title || proactive.label || '');
  if (!title) return false;
  const titleWords = title.split(/\s+/).filter((word) => word.length >= 4).slice(0, 5);
  return titleWords.some((word) => text.includes(word));
}

export async function resolveProactiveMemoReply({ message, brainChat, context } = {}) {
  const selection = selectProactiveMemoReplyTarget({ message, brainChat, now: new Date() });
  if (selection.type === 'none') return null;
  if (selection.type === 'stale') {
    return buildProactiveClarificationResult({
      language: selection.language,
      answer: selection.language === 'it'
        ? 'Questo promemoria sembra vecchio. Quale promemoria vuoi aggiornare?'
        : 'This reminder looks old. Which reminder do you want to update?',
      workingContext: selection.proactive?.working_context,
      reason: 'Proactive memo reply was outside the valid reply window.',
      trace: { stale: true, ambiguous: false, selection_type: selection.type },
    });
  }
  if (selection.type === 'ambiguous') {
    return buildProactiveClarificationResult({
      language: selection.language,
      answer: formatProactiveMemoDisambiguation(selection.candidates, selection.language),
      workingContext: selection.candidates?.[0]?.working_context,
      reason: 'Multiple recent proactive memo reminders matched a short reply.',
      trace: {
        stale: false,
        ambiguous: true,
        selection_type: selection.type,
        candidate_count: selection.candidates?.length ?? 0,
      },
    });
  }
  const proactive = selection.proactive;
  const intent = selection.intent;

  const memoId = proactive.source_id;
  if (!memoId) {
    return buildProactiveClarificationResult({
      answer: proactive.language === 'it'
        ? 'Mi manca il riferimento al promemoria. Quale promemoria vuoi aggiornare?'
        : 'I am missing the reminder reference. Which reminder do you want to update?',
      workingContext: proactive.working_context,
      reason: 'Proactive memo reply was missing source_id.',
      trace: { reason: 'missing_source_id', selection_type: selection.type },
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
      proactive_reply_trace: {
        action_type: 'explain',
        stale: false,
        ambiguous: false,
        selection_type: selection.type,
      },
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
      trace: { action_type: 'done', selection_type: selection.type },
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
      trace: { action_type: 'cancel', selection_type: selection.type },
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
        proactive_reply_trace: {
          action_type: 'snooze_needs_time',
          stale: false,
          ambiguous: false,
          selection_type: selection.type,
        },
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
      trace: { action_type: 'snooze', selection_type: selection.type },
    });
  }

  return null;
}

export function extractLatestProactiveMemoMessage(brainChat) {
  return extractRecentProactiveMemoMessages(brainChat, { now: new Date(), includeExpired: true })[0] ?? null;
}

export function extractRecentProactiveMemoMessages(brainChat, { now = new Date(), includeExpired = false } = {}) {
  const history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  const nowDate = normalizeDate(now);
  const messages = [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item?.role !== 'assistant') continue;
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    if (!metadata.proactive_message || metadata.expected_reply_type !== MEMO_REPLY_TYPE) continue;
    const workingContext = metadata.working_context && typeof metadata.working_context === 'object' ? metadata.working_context : {};
    const subject = workingContext.last_subject && typeof workingContext.last_subject === 'object' ? workingContext.last_subject : {};
    const createdAt = normalizeDate(item.created_at ?? metadata.created_at ?? nowDate);
    const ruleKey = metadata.rule_key || subject.raw?.rule_key || null;
    const message = {
      message_id: item.id,
      outbox_message_id: metadata.outbox_message_id,
      source_id: metadata.source_id || subject.id,
      source_type: metadata.source_type || subject.source_type || 'memo',
      title: subject.label || metadata.memo_title || item.content || 'Memo',
      language: workingContext.language === 'en' ? 'en' : 'it',
      working_context: workingContext,
      expected_reply_type: metadata.expected_reply_type,
      rule_key: ruleKey,
      created_at: createdAt.toISOString(),
      reply_window_hours: getProactiveReplyWindowHours(ruleKey),
      expired: isProactiveMemoReplyExpired({ createdAt, now: nowDate, ruleKey }),
    };
    if (includeExpired || !message.expired) messages.push(message);
  }
  return messages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function selectProactiveMemoReplyTarget({ message, brainChat, now = new Date() } = {}) {
  const intent = normalizeProactiveMemoReply(message);
  if (intent.intent === 'other') return { type: 'none', intent };
  if (looksLikeIndependentProactiveCommand(message)) return { type: 'none', intent, reason: 'independent_command' };
  const all = extractRecentProactiveMemoMessages(brainChat, { now, includeExpired: true });
  if (!all.length) return { type: 'none', intent };
  const language = all[0]?.language === 'en' ? 'en' : 'it';
  const active = dedupeProactiveMemoMessages(all.filter((item) => !item.expired));
  if (!active.length) return { type: 'stale', intent, proactive: all[0], language };
  if (active.length === 1) return { type: 'target', intent, proactive: active[0], language: active[0].language };

  const explicitMatches = active.filter((item) => proactiveMemoTitleMatches(message, item.title));
  if (explicitMatches.length === 1) {
    return { type: 'target', intent, proactive: explicitMatches[0], language: explicitMatches[0].language };
  }

  return { type: 'ambiguous', intent, candidates: active.slice(0, 3), language };
}

export function normalizeProactiveMemoReply(message) {
  const text = normalizeText(message);
  if (!text) return { intent: 'other', confidence: 0, normalized: text };
  if (/^(?:\?|cosa\??|perche\??|why\??|what\??|non ho capito\??|spiega|explain)$/.test(text)) {
    return { intent: 'explain', confidence: 0.9, normalized: text };
  }
  if (/^(?:quanto|quanta|quanti|quante|come|quale|quali|how|which|what)\b/.test(text) && text.length > 12) {
    return { intent: 'other', confidence: 0.2, normalized: text };
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

export { normalizeProactiveAccountabilityReply, selectProactiveAccountabilityReplyTarget };

export function looksLikeIndependentProactiveCommand(message) {
  const text = normalizeText(message);
  if (!text) return false;
  return /\b(?:ricordami|remind me|crea(?:re)?\s+(?:memo|promemoria)|create\s+(?:memo|reminder)|segna|segnami|log|save|blocca|schedule|aggiungi\s+evento|create\s+event|ho speso|spent|ho preso|took|sto andando a dormire|vado a dormire|sleep start)\b/.test(text);
}

export function buildProactiveWorkingContextFromOutbox(outboxMessage) {
  const metadata = outboxMessage?.metadata && typeof outboxMessage.metadata === 'object' ? outboxMessage.metadata : {};
  if (metadata.expected_reply_type === ACCOUNTABILITY_REPLY_TYPE || outboxMessage?.source_type === 'accountability') {
    return buildAccountabilityWorkingContextFromOutbox(outboxMessage);
  }
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

function buildProactiveReplyResult({ answer, actionType, data, workingContext, trace = {} }) {
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
    proactive_reply_trace: {
      stale: false,
      ambiguous: false,
      ...trace,
    },
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

function buildProactiveClarificationResult({ answer, workingContext, reason, trace = {} }) {
  return {
    answer,
    plan: createProactiveReadOnlyPlan(reason),
    actions: [],
    contextSummary: null,
    working_context: workingContext ?? null,
    skipMemoryExtraction: true,
    proactive_reply_trace: {
      action_type: 'clarify',
      ...trace,
    },
  };
}

function formatProactiveMemoDisambiguation(candidates = [], language = 'it') {
  const labels = candidates
    .slice(0, 3)
    .map((item) => item.title)
    .filter(Boolean)
    .map((title) => title.length > 70 ? `${title.slice(0, 67)}...` : title);
  const joined = labels.length ? labels.join(', ') : (language === 'en' ? 'the recent reminders' : 'i promemoria recenti');
  return language === 'en'
    ? `Which reminder do you mean? ${joined}.`
    : `A quale promemoria ti riferisci? ${joined}.`;
}

function getProactiveReplyWindowHours(ruleKey) {
  return ruleKey === 'memo_overdue_followup'
    ? PROACTIVE_REPLY_OVERDUE_WINDOW_HOURS
    : PROACTIVE_REPLY_DEFAULT_WINDOW_HOURS;
}

function isProactiveMemoReplyExpired({ createdAt, now, ruleKey }) {
  const created = normalizeDate(createdAt);
  const nowDate = normalizeDate(now);
  const windowMs = getProactiveReplyWindowHours(ruleKey) * 60 * 60000;
  return nowDate.getTime() - created.getTime() > windowMs;
}

function dedupeProactiveMemoMessages(messages) {
  const seen = new Set();
  const unique = [];
  for (const message of messages) {
    const key = message.source_id || message.outbox_message_id || message.message_id;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(message);
  }
  return unique;
}

function proactiveMemoTitleMatches(message, title) {
  const text = normalizeText(message);
  const tokens = normalizeText(title)
    .split(' ')
    .filter((token) => token.length >= 4);
  if (!text || !tokens.length) return false;
  return tokens.some((token) => text.includes(token));
}

function messageReferencesPendingAction(message, pendingAction) {
  const text = normalizeText(message);
  if (!text) return false;
  const source = [
    pendingAction?.summary,
    pendingAction?.confirmation_question,
    pendingAction?.source_user_message,
    pendingAction?.args?.title,
    pendingAction?.args?.memo_title,
    pendingAction?.args?.event_title,
    pendingAction?.args?.activity,
    pendingAction?.args?.health_field,
    pendingAction?.args?.time,
    pendingAction?.args?.start_time,
    pendingAction?.args?.end_time,
  ].filter(Boolean).join(' ');
  const tokens = normalizeText(source)
    .split(' ')
    .filter((token) => token.length >= 4 || /^\d{1,2}:?\d{2}$/.test(token));
  if (!tokens.length) return false;
  const unique = [...new Set(tokens)];
  const matches = unique.filter((token) => text.includes(token));
  return matches.length >= Math.min(2, unique.length) || (text.length > 12 && matches.some((token) => token.length >= 6));
}

function getLatestProactiveReplyType(brainChat) {
  const history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item?.role !== 'assistant') continue;
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    if (!metadata.proactive_message) continue;
    if (metadata.expected_reply_type === ACCOUNTABILITY_REPLY_TYPE) return ACCOUNTABILITY_REPLY_TYPE;
    if (metadata.expected_reply_type === MEMO_REPLY_TYPE) return MEMO_REPLY_TYPE;
  }
  return null;
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

function normalizeDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
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
