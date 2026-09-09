import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import { addDays, localDateTimeToUtcDate, TIME_ZONE } from './date.js';
import { getHabitEntry, HEALTH_HABITS, normalizeHabitId } from './habits.js';
import { canonicalizeWhatsappSender } from './whatsappBridge.js';
import { ensureAccountabilityHealth, resolveAccountabilityTarget, accountabilityTargetIsResolved } from './brainProactiveDelivery.js';
import { parseHealthReplyTime } from './brainHealthSelfReports.js';
import { normalizeAccountabilityTarget } from './brainMetadata.js';

export const ACCOUNTABILITY_REPLY_TYPE = 'accountability';
export const ACCOUNTABILITY_CREATED_BY = 'brain_proactive_accountability_v1';
export const ACCOUNTABILITY_ATTENTION_PROFILE = {
  quiet_hours_bypass: true,
  max_per_day: 20,
  min_gap_minutes: 20,
};

const HEALTH_LOG_SELECT = 'id, user_id, logged_on, sleep_start, wake_time, hygiene, notes, created_at, updated_at';
const DEFAULT_LANGUAGE = 'it';
const ACCOUNTABILITY_REPLY_WINDOW_HOURS = 18;
const SLEEP_START_REPLY_WINDOW_HOURS = 36;
const DEFAULT_SNOOZE_MINUTES = 90;

const HABIT_TARGETS = {
  shower: { target_count: 1, priority: 'low', label_it: 'doccia', label_en: 'shower' },
  creatine: { target_count: 1, priority: 'low', label_it: 'creatina', label_en: 'creatine' },
  skin: { target_count: 1, priority: 'low', label_it: 'skincare', label_en: 'skincare' },
};

const ACCOUNTABILITY_WINDOWS = {
  wake_time_missing: [
    { key: 'morning', start: '10:30', end: '14:59' },
    { key: 'afternoon', start: '15:00', end: '19:59' },
    { key: 'evening', start: '20:00', end: '22:30' },
  ],
  sleep_start_missing: [
    { key: 'morning', start: '09:30', end: '13:59' },
    { key: 'afternoon', start: '14:00', end: '20:59' },
    { key: 'evening', start: '21:00', end: '23:00' },
  ],
  habits: {
    shower: [
      { key: 'afternoon', start: '15:00', end: '20:59' },
      { key: 'evening', start: '21:00', end: '23:30' },
    ],
    creatine: [
      { key: 'afternoon', start: '14:00', end: '19:59' },
      { key: 'evening', start: '20:00', end: '23:00' },
    ],
    skin: [
      { key: 'evening', start: '21:00', end: '23:29' },
      { key: 'late', start: '23:30', end: '23:59' },
    ],
  },
};

export const accountabilityProactiveRuleFamily = {
  family: 'accountability',
  loadContext: loadAccountabilityProactiveContext,
  buildCandidates: buildAccountabilityProactiveCandidatesFromContext,
};

export async function loadAccountabilityProactiveContext({ userId = getActionUserId(), now = new Date() } = {}) {
  const nowDate = normalizeDate(now);
  const today = localDateFromInstant(nowDate);
  const start = addDays(today, -2);
  const result = await getSupabaseAdmin()
    .from('health_logs')
    .select(HEALTH_LOG_SELECT)
    .eq('user_id', userId)
    .gte('logged_on', start)
    .lte('logged_on', today)
    .order('logged_on', { ascending: false });
  if (result.error) throw result.error;
  return {
    family: 'accountability',
    health_logs: result.data ?? [],
    local_date: today,
    language: DEFAULT_LANGUAGE,
  };
}

export function buildAccountabilityProactiveCandidatesFromContext({ context, now = new Date(), recipient } = {}) {
  return buildAccountabilityProactiveCandidates({
    healthLogs: context?.health_logs ?? context?.healthLogs ?? [],
    now,
    recipient,
    language: context?.language,
  });
}

export function buildAccountabilityProactiveCandidates({
  healthLogs = [],
  now = new Date(),
  recipient,
  language = DEFAULT_LANGUAGE,
} = {}) {
  const nowDate = normalizeDate(now);
  const localToday = localDateFromInstant(nowDate);
  const logsByDate = indexHealthLogsByDate(healthLogs);
  const todayLog = logsByDate.get(localToday);
  const candidates = [];

  if (!cleanTime(todayLog?.wake_time)) {
    candidates.push(...buildWakeTimeMissingCandidates({
      recipient,
      localDate: localToday,
      now: nowDate,
      language,
    }));
  }

  const sleepDate = addDays(localToday, -1);
  const sleepLog = logsByDate.get(sleepDate);
  if (!cleanTime(sleepLog?.sleep_start)) {
    candidates.push(...buildSleepStartMissingCandidates({
      recipient,
      localDate: localToday,
      sleepDate,
      now: nowDate,
      language,
    }));
  }

  for (const habit of HEALTH_HABITS) {
    const habitId = normalizeHabitId(habit.id);
    const target = HABIT_TARGETS[habitId];
    if (!target) continue;
    const entry = getHabitEntry(todayLog?.hygiene, habitId);
    if (Number(entry.count ?? 0) >= target.target_count) continue;
    candidates.push(...buildHabitMissingCandidates({
      recipient,
      localDate: localToday,
      habitId,
      target,
      now: nowDate,
      language,
    }));
  }

  return candidates;
}

export function buildAccountabilityWorkingContextFromOutbox(outboxMessage) {
  const metadata = safeObject(outboxMessage?.metadata);
  const accountability = safeObject(metadata.accountability);
  const language = metadata.language === 'en' ? 'en' : 'it';
  const label = accountabilityLabel(accountability, language, outboxMessage?.body);
  return {
    language,
    last_subject: {
      id: outboxMessage?.source_id || sourceIdForAccountability(accountability) || null,
      type: 'accountability',
      label,
      date: accountability.local_date || accountability.sleep_date || null,
      start_time: null,
      source: 'proactive_whatsapp_accountability',
      source_type: outboxMessage?.source_type || 'accountability',
      source_id: outboxMessage?.source_id || sourceIdForAccountability(accountability) || null,
      due_at: outboxMessage?.scheduled_for || null,
      created_by_last_action: false,
      confidence: 0.95,
      raw: {
        outbox_message_id: outboxMessage?.id,
        rule_key: outboxMessage?.rule_key,
        expected_reply_type: ACCOUNTABILITY_REPLY_TYPE,
        accountability,
      },
    },
    last_action_result: null,
  };
}

export function extractRecentProactiveAccountabilityMessages(brainChat, { now = new Date(), includeExpired = false } = {}) {
  const history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  const nowDate = normalizeDate(now);
  const messages = [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item?.role !== 'assistant') continue;
    const metadata = safeObject(item.metadata);
    if (!metadata.proactive_message || metadata.expected_reply_type !== ACCOUNTABILITY_REPLY_TYPE) continue;
    if (metadata.proactive_resolution) continue;
    const workingContext = safeObject(metadata.working_context);
    const subject = safeObject(workingContext.last_subject);
    const raw = safeObject(subject.raw);
    const sourceId = metadata.source_id || subject.source_id || subject.id;
    const candidateTarget = normalizeAccountabilityTarget(metadata.accountability)
      || normalizeAccountabilityTarget(raw.accountability);
    const accountability = candidateTarget && sourceIdForAccountability(candidateTarget) === sourceId
      ? candidateTarget
      : {};
    const createdAt = normalizeDate(item.created_at ?? metadata.created_at ?? nowDate);
    const replyWindowHours = accountability.kind === 'sleep_start_missing'
      ? SLEEP_START_REPLY_WINDOW_HOURS
      : ACCOUNTABILITY_REPLY_WINDOW_HOURS;
    const message = {
      message_id: item.id,
      outbox_message_id: metadata.outbox_message_id,
      source_id: sourceId,
      source_type: metadata.source_type || subject.source_type || 'accountability',
      title: subject.label || accountabilityLabel(accountability, workingContext.language, item.content),
      language: workingContext.language === 'en' ? 'en' : 'it',
      working_context: workingContext,
      expected_reply_type: metadata.expected_reply_type,
      rule_key: metadata.rule_key || raw.rule_key || null,
      accountability,
      created_at: createdAt.toISOString(),
      reply_window_hours: replyWindowHours,
      expired: nowDate.getTime() - createdAt.getTime() > replyWindowHours * 60 * 60000,
    };
    if (includeExpired || !message.expired) messages.push(message);
  }
  return messages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function selectProactiveAccountabilityReplyTarget({ message, brainChat, now = new Date() } = {}) {
  const intent = normalizeProactiveAccountabilityReply(message);
  if (intent.intent === 'other') return { type: 'none', intent };
  if (looksLikeIndependentAccountabilityCommand(message)) return { type: 'none', intent, reason: 'independent_command' };
  const all = extractRecentProactiveAccountabilityMessages(brainChat, { now, includeExpired: true });
  if (!all.length) return { type: 'none', intent };
  const language = all[0]?.language === 'en' ? 'en' : 'it';
  const active = dedupeAccountabilityMessages(all.filter((item) => !item.expired));
  if (!active.length) return { type: 'stale', intent, proactive: all[0], language };
  const explicit = active.filter((item) => accountabilityTargetMatches(message, item));
  if (explicit.length === 1) return { type: 'target', intent, proactive: explicit[0], language: explicit[0].language };
  if (active.length > 1) return { type: 'ambiguous', intent, candidates: active.slice(0, 3), language };
  return { type: 'target', intent, proactive: active[0], language: active[0].language };
}

export function normalizeProactiveAccountabilityReply(message) {
  const text = normalizeText(message);
  if (!text) return { intent: 'other', confidence: 0, normalized: text };
  if (/^(?:\?|perche\??|why\??|cosa\??|what\??|spiega|explain)$/.test(text)) {
    return { intent: 'explain', confidence: 0.9, normalized: text };
  }
  if (/\b(?:non ho dormito|not slept|did not sleep|all nighter|allnighter|not sleep)\b/.test(text)) {
    return { intent: 'no_sleep', confidence: 0.9, normalized: text };
  }
  if (/\b(?:non\s+(?:ho\s+)?(?:fatto|fatta|preso|presa)|non\s+fatta|non\s+pres[ao]|did\s+not|didn't|have\s+not|haven't)\b/.test(text)) {
    return { intent: 'no', confidence: 0.94, normalized: text };
  }
  if (/\b(?:piu tardi|piu avanti|later|tra\s+\d+|fra\s+\d+|in\s+\d+|snooze|rimanda|posticipa)\b/.test(text)) {
    return { intent: 'snooze', confidence: 0.86, normalized: text, minutes: extractAccountabilitySnoozeMinutes(text) };
  }
  if (/^(?:no|nope|non ancora|not yet|non so|boh|skip|salta)$/.test(text)) {
    return { intent: 'no', confidence: 0.88, normalized: text };
  }
  if (/^(?:ora|adesso|now)$/.test(text)) {
    return { intent: 'time', confidence: 0.9, normalized: text, time: null, use_now: true };
  }
  const time = parseHealthReplyTime(text);
  if (time) return { intent: 'time', confidence: 0.86, normalized: text, time, use_now: false };
  if (/^(?:si|s|yes|y|ok|okay|fatto|fatta|fatte|done|presa|preso|gia fatto|gia presa|gia|esatto)$/.test(text)
    || /\b(?:fatto|fatta|done|presa|preso|gia fatto|gia presa|l ho fatta|l ho preso)\b/.test(text)) {
    return { intent: 'done', confidence: 0.9, normalized: text };
  }
  return { intent: 'other', confidence: 0.2, normalized: text };
}

export async function resolveProactiveAccountabilityReply({
  message,
  brainChat,
  context = {},
  now = new Date(),
  actions = defaultAccountabilityActions,
  selection: suppliedSelection,
} = {}) {
  const selection = suppliedSelection || selectProactiveAccountabilityReplyTarget({ message, brainChat, now });
  if (selection.type === 'none') return null;
  if (selection.type === 'ambiguous') return buildAccountabilityClarificationResult({ language: selection.language,
    answer: `Quale check-in intendi? ${(selection.candidates || []).map((item) => item.title).join('; ')}`, trace: { ambiguous: true } });
  if (selection.type === 'stale') {
    return buildAccountabilityClarificationResult({
      language: selection.language,
      answer: selection.language === 'en'
        ? 'That check-in looks old. Which health item do you want to update?'
        : 'Questo check-in sembra vecchio. Quale dato salute vuoi aggiornare?',
      workingContext: selection.proactive?.working_context,
      trace: { stale: true, ambiguous: false, selection_type: selection.type },
    });
  }

  const proactive = selection.proactive;
  const intent = selection.intent;
  const accountability = safeObject(proactive.accountability);
  const language = proactive.language === 'en' ? 'en' : 'it';
  if (await actions.isResolved?.(proactive)) return buildAccountabilityReadOnlyResult({ language,
    answer: language === 'en' ? 'That check-in is already resolved. Nothing changed.' : 'Questo check-in e gia risolto. Non modifico nulla.', trace: { idempotent_noop: true } });
  if (!accountability.kind) {
    return buildAccountabilityClarificationResult({
      language,
      answer: language === 'en'
        ? 'I am missing the health check-in reference. Which item should I update?'
        : 'Mi manca il riferimento al check-in salute. Quale dato devo aggiornare?',
      workingContext: proactive.working_context,
      trace: { reason: 'missing_accountability_metadata', selection_type: selection.type },
    });
  }

  if (intent.intent === 'explain') {
    return buildAccountabilityReadOnlyResult({
      language,
      answer: explainAccountabilityTarget(accountability, language),
      workingContext: proactive.working_context,
      trace: { action_type: 'explain', selection_type: selection.type },
    });
  }

  if (intent.intent === 'no' || intent.intent === 'no_sleep') {
    await actions.resolveTarget?.({ proactive, resolution: intent.intent });
    return buildAccountabilityReadOnlyResult({
      language,
      answer: language === 'en' ? 'Ok, I will not log anything.' : 'Ok, non segno nulla.',
      workingContext: proactive.working_context,
      trace: { action_type: intent.intent, selection_type: selection.type },
    });
  }

  if (intent.intent === 'snooze') {
    const minutes = intent.minutes || DEFAULT_SNOOZE_MINUTES;
    const snoozed = await actions.enqueueSnooze?.({
      proactive,
      accountability,
      context,
      now,
      minutes,
    });
    if (snoozed) await actions.resolveTarget?.({ proactive, resolution: 'snooze', preserveId: snoozed.id });
    return buildAccountabilityReadOnlyResult({
      language,
      answer: snoozed
        ? (language === 'en' ? 'Ok, I will ask again later.' : 'Ok, te lo richiedo piu tardi.')
        : (language === 'en' ? 'Ok, I will leave it open.' : 'Ok, lo lascio aperto.'),
      workingContext: proactive.working_context,
      trace: { action_type: 'snooze', selection_type: selection.type, snoozed: Boolean(snoozed), minutes },
    });
  }

  if (accountability.kind === 'habit_missing') {
    return resolveHabitAccountabilityReply({ proactive, accountability, intent, language, now, actions });
  }
  if (accountability.kind === 'wake_time_missing') {
    return resolveWakeTimeAccountabilityReply({ proactive, accountability, intent, language, now, actions });
  }
  if (accountability.kind === 'sleep_start_missing') {
    return resolveSleepStartAccountabilityReply({ proactive, accountability, intent, language, actions });
  }

  return buildAccountabilityClarificationResult({
    language,
    answer: language === 'en' ? 'Which health item should I update?' : 'Quale dato salute devo aggiornare?',
    workingContext: proactive.working_context,
    trace: { reason: 'unsupported_accountability_kind', kind: accountability.kind },
  });
}

export async function enqueueAccountabilitySnoozeOutboxMessage({ proactive, accountability, context, now = new Date(), minutes = DEFAULT_SNOOZE_MINUTES, client = getSupabaseAdmin(), userId = getActionUserId() } = {}) {
  const recipient = context?.channelMetadata?.whatsapp_sender || proactive?.recipient;
  if (!recipient || !proactive?.outbox_message_id) return null;
  const canonicalRecipient = canonicalizeWhatsappSender(recipient);
  const nowDate = normalizeDate(now);
  const scheduledFor = new Date(nowDate.getTime() + Math.min(720, Math.max(5, Math.trunc(Number(minutes)) || DEFAULT_SNOOZE_MINUTES)) * 60000);
  const sourceId = proactive?.source_id || sourceIdForAccountability(accountability);
  const payload = {
    user_id: userId,
    channel: 'whatsapp',
    recipient: canonicalRecipient,
    body: accountabilityBody(accountability, proactive?.language || DEFAULT_LANGUAGE),
    priority: accountability.kind === 'habit_missing' ? 'low' : 'normal',
    rule_key: `${proactive?.rule_key || ruleKeyForAccountability(accountability)}_snooze`,
    source_type: 'accountability',
    source_id: sourceId,
    idempotency_key: `accountability_snooze:${proactive.outbox_message_id}`,
    scheduled_for: scheduledFor.toISOString(),
    expires_at: new Date(scheduledFor.getTime() + 4 * 60 * 60000).toISOString(),
    metadata: {
      created_by: ACCOUNTABILITY_CREATED_BY,
      expected_reply_type: ACCOUNTABILITY_REPLY_TYPE,
      language: proactive?.language || DEFAULT_LANGUAGE,
      accountability,
      attention_profile: ACCOUNTABILITY_ATTENTION_PROFILE,
      proactive_trace: {
        rule_key: `${proactive?.rule_key || ruleKeyForAccountability(accountability)}_snooze`,
        decision: 'snooze',
        source_type: 'accountability',
        source_id: sourceId,
        scheduled_for: scheduledFor.toISOString(),
      },
    },
  };
  const inserted = await client
    .from('brain_outbox_messages')
    .insert(payload)
    .select('id, status, scheduled_for')
    .single();
  if (!inserted.error) return inserted.data;
  if (inserted.error.code === 'P0001' && inserted.error.message === 'attention_deferred') return null;
  if (inserted.error.code !== '23505') throw inserted.error;
  const existing = await client.from('brain_outbox_messages').select('id,scheduled_for')
    .eq('user_id', payload.user_id).eq('idempotency_key', payload.idempotency_key).single();
  if (existing.error) throw existing.error;
  return { ...existing.data, duplicate: true };
}

async function resolveHabitAccountabilityReply({ proactive, accountability, intent, language, now, actions }) {
  if (!accountability.habit_id) {
    return buildAccountabilityClarificationResult({
      language,
      answer: language === 'en' ? 'Which habit should I log?' : 'Quale abitudine devo segnare?',
      workingContext: proactive.working_context,
      trace: { reason: 'missing_habit_id' },
    });
  }
  if (!['done', 'time'].includes(intent.intent)) {
    return buildAccountabilityClarificationResult({
      language,
      answer: language === 'en' ? 'Done or not yet?' : 'Fatta o non ancora?',
      workingContext: proactive.working_context,
      trace: { reason: 'ambiguous_habit_reply', intent: intent.intent },
    });
  }
  const time = intent.use_now ? localTimeFromInstant(now) : (intent.time || localTimeFromInstant(now));
  const data = await actions.updateHealthLog({
    logged_on: accountability.local_date,
    [accountability.habit_id]: true,
    habit_time: time,
    target_count: accountability.target_count || 1,
  });
  await actions.resolveTarget?.({ proactive, resolution: intent.intent });
  if (data?.accountability_noop) return buildAccountabilityReadOnlyResult({ language, answer: language === 'en' ? 'Already logged. Nothing changed.' : 'Gia segnato. Non modifico nulla.', trace: { idempotent_noop: true } });
  const label = habitLabel(accountability.habit_id, language);
  const answer = language === 'en'
    ? `Logged: ${label} done today.`
    : `Segnato: ${label} fatta oggi.`;
  return buildAccountabilityWriteResult({
    answer,
    actionType: 'update_health_log',
    data,
    workingContext: buildAccountabilityActionWorkingContext({ proactive, accountability, actionType: 'update_health_log', answer }),
    trace: { action_type: 'habit_done', habit_id: accountability.habit_id },
  });
}

async function resolveWakeTimeAccountabilityReply({ proactive, accountability, intent, language, now, actions }) {
  if (intent.intent !== 'time') {
    return buildAccountabilityClarificationResult({
      language,
      answer: language === 'en' ? 'What time exactly?' : 'A che ora esattamente?',
      workingContext: proactive.working_context,
      trace: { reason: 'wake_time_needs_time', intent: intent.intent },
    });
  }
  const time = intent.use_now ? localTimeFromInstant(now) : intent.time;
  if (!time) {
    return buildAccountabilityClarificationResult({
      language,
      answer: language === 'en' ? 'What time exactly?' : 'A che ora esattamente?',
      workingContext: proactive.working_context,
      trace: { reason: 'wake_time_missing_time' },
    });
  }
  const data = await actions.updateHealthLog({
    logged_on: accountability.local_date,
    wake_time: time,
  });
  await actions.resolveTarget?.({ proactive, resolution: 'time' });
  if (data?.accountability_noop) return buildAccountabilityReadOnlyResult({ language, answer: language === 'en' ? 'Wake time is already logged.' : 'Il risveglio e gia segnato.', trace: { idempotent_noop: true } });
  const answer = language === 'en' ? `Logged wake time: ${time}.` : `Segnato wake time: ${time}.`;
  return buildAccountabilityWriteResult({
    answer,
    actionType: 'update_health_log',
    data,
    workingContext: buildAccountabilityActionWorkingContext({ proactive, accountability, actionType: 'update_health_log', answer }),
    trace: { action_type: 'wake_time', time },
  });
}

async function resolveSleepStartAccountabilityReply({ proactive, accountability, intent, language, actions }) {
  if (intent.intent !== 'time') {
    return buildAccountabilityClarificationResult({
      language,
      answer: language === 'en' ? 'What time exactly?' : 'A che ora esattamente?',
      workingContext: proactive.working_context,
      trace: { reason: 'sleep_start_needs_time', intent: intent.intent },
    });
  }
  if (!intent.time) {
    return buildAccountabilityClarificationResult({
      language,
      answer: language === 'en' ? 'What time exactly?' : 'A che ora esattamente?',
      workingContext: proactive.working_context,
      trace: { reason: 'sleep_start_missing_time' },
    });
  }
  const data = await actions.logSleepStart({
    time: intent.time,
    loggedOn: accountability.sleep_date,
  });
  await actions.resolveTarget?.({ proactive, resolution: 'time' });
  if (data?.accountability_noop) return buildAccountabilityReadOnlyResult({ language, answer: language === 'en' ? 'Sleep start is already logged.' : 'Lo sleep start e gia segnato.', trace: { idempotent_noop: true } });
  const answer = language === 'en' ? `Logged sleep start: ${intent.time}.` : `Segnato sleep start: ${intent.time}.`;
  return buildAccountabilityWriteResult({
    answer,
    actionType: 'log_sleep_start',
    data,
    workingContext: buildAccountabilityActionWorkingContext({ proactive, accountability, actionType: 'log_sleep_start', answer }),
    trace: { action_type: 'sleep_start', time: intent.time, sleep_date: accountability.sleep_date },
  });
}

function buildWakeTimeMissingCandidates({ recipient, localDate, now, language }) {
  return buildWindowCandidates({
    windows: ACCOUNTABILITY_WINDOWS.wake_time_missing,
    now,
    localDate,
    seedBase: `wake_time:${localDate}`,
    build: ({ window, scheduledFor, expiresAt }) => buildAccountabilityCandidate({
      recipient,
      localDate,
      window,
      scheduledFor,
      expiresAt,
      ruleKey: 'accountability_wake_time_missing',
      sourceId: `wake_time:${localDate}`,
      body: language === 'en' ? 'What time did you wake up today?' : 'A che ora ti sei svegliato oggi?',
      priority: 'normal',
      language,
      accountability: {
        kind: 'wake_time_missing',
        field: 'wake_time',
        local_date: localDate,
        window_key: window.key,
      },
    }),
  });
}

function buildSleepStartMissingCandidates({ recipient, localDate, sleepDate, now, language }) {
  return buildWindowCandidates({
    windows: ACCOUNTABILITY_WINDOWS.sleep_start_missing,
    now,
    localDate,
    seedBase: `sleep_start:${sleepDate}`,
    build: ({ window, scheduledFor, expiresAt }) => buildAccountabilityCandidate({
      recipient,
      localDate,
      window,
      scheduledFor,
      expiresAt,
      ruleKey: 'accountability_sleep_start_missing_previous_night',
      sourceId: `sleep_start:${sleepDate}`,
      body: language === 'en'
        ? "I don't have last night's sleep start. What time did you go to sleep?"
        : 'Non ho lo sleep start di ieri notte. A che ora sei andato a dormire?',
      priority: 'normal',
      language,
      accountability: {
        kind: 'sleep_start_missing',
        field: 'sleep_start',
        local_date: localDate,
        sleep_date: sleepDate,
        window_key: window.key,
      },
    }),
  });
}

function buildHabitMissingCandidates({ recipient, localDate, habitId, target, now, language }) {
  return buildWindowCandidates({
    windows: ACCOUNTABILITY_WINDOWS.habits[habitId] ?? [],
    now,
    localDate,
    seedBase: `habit:${habitId}:${localDate}`,
    build: ({ window, scheduledFor, expiresAt }) => buildAccountabilityCandidate({
      recipient,
      localDate,
      window,
      scheduledFor,
      expiresAt,
      ruleKey: 'accountability_habit_missing',
      sourceId: `habit:${habitId}:${localDate}`,
      body: habitQuestion(habitId, language),
      priority: target.priority,
      language,
      accountability: {
        kind: 'habit_missing',
        habit_id: habitId,
        local_date: localDate,
        window_key: window.key,
        target_count: target.target_count,
      },
    }),
  });
}

function buildWindowCandidates({ windows, now, localDate, seedBase, build }) {
  const nowDate = normalizeDate(now);
  const candidates = [];
  for (const window of windows) {
    const scheduledFor = scheduledDateForWindow(localDate, window, `${seedBase}:${window.key}`);
    const expiresAt = localDateTimeToUtcDate(localDate, window.end);
    if (!scheduledFor || !expiresAt) continue;
    if (nowDate < scheduledFor || nowDate > expiresAt) continue;
    candidates.push(build({ window, scheduledFor, expiresAt }));
  }
  return candidates;
}

function buildAccountabilityCandidate({
  recipient,
  localDate,
  window,
  scheduledFor,
  expiresAt,
  ruleKey,
  sourceId,
  body,
  priority,
  language,
  accountability,
}) {
  const idempotencyKey = `accountability:${ruleKey}:${sourceId}:${localDate}:${window.key}`;
  return {
    channel: 'whatsapp',
    recipient: cleanText(recipient, 180),
    body: cleanText(body, 1000),
    priority,
    rule_key: ruleKey,
    source_type: 'accountability',
    source_id: sourceId,
    idempotency_key: idempotencyKey,
    scheduled_for: scheduledFor.toISOString(),
    expires_at: expiresAt.toISOString(),
    metadata: {
      created_by: ACCOUNTABILITY_CREATED_BY,
      expected_reply_type: ACCOUNTABILITY_REPLY_TYPE,
      language: language === 'en' ? 'en' : 'it',
      accountability,
      attention_profile: ACCOUNTABILITY_ATTENTION_PROFILE,
      proactive_trace: {
        rule_key: ruleKey,
        decision: 'candidate',
        idempotency_key: idempotencyKey,
        source_type: 'accountability',
        source_id: sourceId,
        scheduled_for: scheduledFor.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
    },
  };
}

function scheduledDateForWindow(localDate, window, seed) {
  const startMinutes = timeToMinutes(window.start);
  const endMinutes = timeToMinutes(window.end);
  const span = Math.max(0, endMinutes - startMinutes);
  const offset = deterministicJitterMinutes(seed, span);
  return localDateTimeToUtcDate(localDate, minutesToTime(startMinutes + offset));
}

export function deterministicJitterMinutes(seed, maxInclusive) {
  const max = Math.max(0, Math.trunc(Number(maxInclusive)) || 0);
  if (max === 0) return 0;
  let hash = 2166136261;
  const text = String(seed ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % (max + 1);
}

function buildAccountabilityWriteResult({ answer, actionType, data, workingContext, trace = {} }) {
  return {
    answer,
    plan: {
      intent: actionType,
      needsRead: false,
      needsWrite: true,
      riskLevel: 'low',
      args: {},
      reasoning: 'Resolved deterministic proactive accountability reply.',
    },
    actions: [{
      type: actionType,
      data: {
        ...data,
        sourcePath: 'proactive_whatsapp_accountability_reply',
      },
    }],
    contextSummary: null,
    working_context: workingContext,
    skipMemoryExtraction: true,
    proactive_reply_trace: {
      stale: false,
      ambiguous: false,
      expected_reply_type: ACCOUNTABILITY_REPLY_TYPE,
      ...trace,
    },
  };
}

function buildAccountabilityReadOnlyResult({ language, answer, workingContext, trace = {} }) {
  return {
    answer,
    plan: {
      intent: 'clarify',
      needsRead: false,
      needsWrite: false,
      riskLevel: 'low',
      args: {},
      reasoning: 'Resolved deterministic proactive accountability reply without a write.',
    },
    actions: [],
    contextSummary: null,
    working_context: workingContext ?? null,
    skipMemoryExtraction: true,
    proactive_reply_trace: {
      action_type: 'accountability_read_only',
      stale: false,
      ambiguous: false,
      expected_reply_type: ACCOUNTABILITY_REPLY_TYPE,
      language,
      ...trace,
    },
  };
}

function buildAccountabilityClarificationResult({ language, answer, workingContext, trace = {} }) {
  return {
    answer,
    plan: {
      intent: 'clarify',
      needsRead: false,
      needsWrite: false,
      riskLevel: 'low',
      args: {},
      reasoning: 'Clarify proactive accountability reply.',
    },
    actions: [],
    contextSummary: null,
    working_context: workingContext ?? null,
    skipMemoryExtraction: true,
    proactive_reply_trace: {
      action_type: 'clarify',
      stale: false,
      ambiguous: false,
      expected_reply_type: ACCOUNTABILITY_REPLY_TYPE,
      language,
      ...trace,
    },
  };
}

function buildAccountabilityActionWorkingContext({ proactive, accountability, actionType, answer }) {
  return {
    ...(proactive.working_context ?? {}),
    last_action_result: {
      action_type: actionType,
      status: 'success',
      summary: answer,
      args: accountability,
      result: {
        source_type: 'accountability',
        source_id: proactive.source_id,
        accountability,
      },
      created_at: new Date().toISOString(),
    },
  };
}

const defaultAccountabilityActions = {
  updateHealthLog: ensureAccountabilityHealth,
  logSleepStart: ensureAccountabilityHealth,
  resolveTarget: resolveAccountabilityTarget,
  isResolved: accountabilityTargetIsResolved,
  enqueueSnooze: enqueueAccountabilitySnoozeOutboxMessage,
};

function indexHealthLogsByDate(logs = []) {
  const map = new Map();
  for (const log of logs) {
    if (log?.logged_on) map.set(String(log.logged_on), log);
  }
  return map;
}

function dedupeAccountabilityMessages(messages) {
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

function accountabilityTargetMatches(message, item) {
  const text = normalizeText(message);
  const accountability = safeObject(item.accountability);
  if (accountability.habit_id && text.includes(accountability.habit_id)) return true;
  if (accountability.habit_id && text.includes(habitLabel(accountability.habit_id, 'it'))) return true;
  if (accountability.field && text.includes(normalizeText(accountability.field))) return true;
  const titleTokens = normalizeText(item.title).split(' ').filter((token) => token.length >= 4);
  return titleTokens.some((token) => text.includes(token));
}

function looksLikeIndependentAccountabilityCommand(message) {
  const text = normalizeText(message);
  if (!text) return false;
  return /\b(?:ricordami|crea(?:re)?\s+(?:memo|promemoria)|create\s+(?:memo|reminder)|segna\s+(?:memo|promemoria|evento)|fissa|blocca|metti\s+in\s+calendario|ho speso|spent)\b/.test(text);
}

function explainAccountabilityTarget(accountability, language) {
  if (accountability.kind === 'habit_missing') {
    const label = habitLabel(accountability.habit_id, language);
    return language === 'en'
      ? `I asked because ${label} is not logged for today.`
      : `Te l'ho chiesto perche' ${label} non risulta segnata oggi.`;
  }
  if (accountability.kind === 'wake_time_missing') {
    return language === 'en'
      ? 'I asked because today has no wake time logged yet.'
      : "Te l'ho chiesto perche oggi non ho ancora il wake time.";
  }
  if (accountability.kind === 'sleep_start_missing') {
    return language === 'en'
      ? "I asked because last night's sleep start is missing."
      : "Te l'ho chiesto perche manca lo sleep start di ieri notte.";
  }
  return language === 'en' ? 'I asked for a missing health check-in.' : "Te l'ho chiesto per un check-in salute mancante.";
}

function accountabilityBody(accountability, language = DEFAULT_LANGUAGE) {
  if (accountability.kind === 'habit_missing') return habitQuestion(accountability.habit_id, language);
  if (accountability.kind === 'wake_time_missing') {
    return language === 'en' ? 'What time did you wake up today?' : 'A che ora ti sei svegliato oggi?';
  }
  if (accountability.kind === 'sleep_start_missing') {
    return language === 'en'
      ? "I don't have last night's sleep start. What time did you go to sleep?"
      : 'Non ho lo sleep start di ieri notte. A che ora sei andato a dormire?';
  }
  return language === 'en' ? 'Health check-in?' : 'Check-in salute?';
}

function habitQuestion(habitId, language = DEFAULT_LANGUAGE) {
  if (habitId === 'shower') return language === 'en' ? 'Shower done today?' : 'Doccia fatta oggi?';
  if (habitId === 'creatine') return language === 'en' ? 'Creatine taken today?' : 'Creatina presa oggi?';
  if (habitId === 'skin') return language === 'en' ? 'Skincare done?' : 'Skincare fatta?';
  return language === 'en' ? 'Habit done today?' : 'Abitudine fatta oggi?';
}

function habitLabel(habitId, language = DEFAULT_LANGUAGE) {
  const target = HABIT_TARGETS[habitId];
  if (!target) return habitId || (language === 'en' ? 'habit' : 'abitudine');
  return language === 'en' ? target.label_en : target.label_it;
}

function accountabilityLabel(accountability, language = DEFAULT_LANGUAGE, fallback = null) {
  if (accountability.kind === 'habit_missing') return habitLabel(accountability.habit_id, language);
  if (accountability.kind === 'wake_time_missing') return language === 'en' ? 'wake time' : 'wake time';
  if (accountability.kind === 'sleep_start_missing') return language === 'en' ? 'sleep start' : 'sleep start';
  return cleanText(fallback, 100) || (language === 'en' ? 'health check-in' : 'check-in salute');
}

function ruleKeyForAccountability(accountability) {
  if (accountability.kind === 'habit_missing') return 'accountability_habit_missing';
  if (accountability.kind === 'wake_time_missing') return 'accountability_wake_time_missing';
  if (accountability.kind === 'sleep_start_missing') return 'accountability_sleep_start_missing_previous_night';
  return 'accountability';
}

function sourceIdForAccountability(accountability) {
  if (accountability.kind === 'habit_missing') return `habit:${accountability.habit_id}:${accountability.local_date}`;
  if (accountability.kind === 'wake_time_missing') return `wake_time:${accountability.local_date}`;
  if (accountability.kind === 'sleep_start_missing') return `sleep_start:${accountability.sleep_date}`;
  return null;
}

function extractAccountabilitySnoozeMinutes(text) {
  const numeric = text.match(/\b(?:tra|fra|in|snooze|later)\s+(\d{1,3})\s*(m|min|minuti|minutes?|ore|ora|hours?)?\b/)
    || text.match(/\b(\d{1,3})\s*(m|min|minuti|minutes?)\b/);
  if (numeric) {
    const value = Number(numeric[1]);
    const unit = numeric[2] || 'min';
    if (!Number.isInteger(value) || value <= 0) return null;
    const minutes = /\b(?:ore|ora|hours?)\b/.test(unit) ? value * 60 : value;
    return minutes <= 720 ? minutes : null;
  }
  if (/\b(?:un ora|un'ora|una ora|one hour)\b/.test(text)) return 60;
  if (/\b(?:piu tardi|later|snooze)\b/.test(text)) return DEFAULT_SNOOZE_MINUTES;
  return null;
}

function localDateFromInstant(value = new Date()) {
  const parts = localParts(normalizeDate(value));
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function localTimeFromInstant(value = new Date()) {
  const parts = localParts(normalizeDate(value));
  return `${String(parts.hour % 24).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function localParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) => ['year', 'month', 'day', 'hour', 'minute'].includes(part.type))
      .map((part) => [part.type, Number(part.value)]),
  );
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value) {
  const minutes = Math.max(0, Math.trunc(Number(value)) || 0);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function cleanTime(value) {
  const text = String(value ?? '').trim();
  return /^\d{2}:[0-5]\d(?::\d{2})?$/.test(text) ? text.slice(0, 5) : null;
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

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanText(value, max = 1000) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}
