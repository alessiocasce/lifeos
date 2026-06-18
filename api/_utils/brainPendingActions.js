import { generateGeminiJson } from './gemini.js';
import { addDays, localDate, localTime } from './date.js';
import { normalizeTimeRange, optionalDate } from './validation.js';

const PENDING_ACTION_TTL_HOURS = 24;
const SUPPORTED_ACTIONS = new Set(['update_health_log', 'log_sleep_start', 'create_calendar_event', 'create_memo', 'create_expense']);
const LOW_RISK_THRESHOLD = 0.72;
const MEDIUM_RISK_THRESHOLD = 0.85;

const PENDING_ACTION_EXTRACTOR_SYSTEM = `
You extract possible LifeOS pending action candidates.
You are not answering the user and you are not executing tools.
Return strict JSON only. No markdown.

Schema:
{
  "candidate": {
    "action_type": "update_health_log" | "log_sleep_start" | "create_calendar_event" | "create_memo" | "create_expense" | "update_project" | "log_project_session" | "unsupported" | null,
    "confidence": 0.0,
    "language": "it" | "en",
    "summary": "short summary",
    "args": {},
    "missing_fields": [],
    "confirmation_required": true,
    "confirmation_question": "specific question",
    "risk_level": "low" | "medium" | "high",
    "reason": "short reason"
  }
}

Rules:
- Infer semantic intent and slots from natural language.
- Do not execute anything.
- Do not invent missing fields.
- Preserve fields explicitly provided by the user.
- Use Europe/Rome local date references from the prompt.
- Use "today_local" or "tomorrow_local" only when the user says today/oggi or tomorrow/domani.
- Vague times such as after lunch, after dinner, morning, afternoon, evening, dopo pranzo, dopo cena, mattina, pomeriggio, sera are missing exact time fields.
- Never output destructive actions.
- If the user is asking for advice/analysis rather than logging/creating, return null or unsupported.
- If the user explicitly says not to create/log/save, return null or unsupported.
- Prefer a pending action when the user gave useful low-risk action details but confirmation or slots are still needed.
- For health naps/pisolini, do not set sleep_start, wake_time, or sleep_hours. Use health_note_append instead.
- For going to sleep / bedtime / inizio sonno / vado a dormire / sto andando a letto / sleep start commands, use action_type "log_sleep_start" with args.time in 24-hour HH:MM. Do not map these to a generic health note.

Examples:
User: oggi ho fatto un pisolino dalle 7.40 alle 10 di sera
Candidate: update_health_log, args date=today_local, health_note_append="Pisolino: 19:40-22:00", nap_start_time="19:40", nap_end_time="22:00", no missing fields, confirmation_required=true.

User: Segna che sto andando a dormire ora alle 3.41am
Candidate: log_sleep_start, args time="03:41", no missing fields, confirmation_required=true, confirmation_question="Confermi che devo registrare l'inizio del sonno alle 03:41?"

User: blocca domani un'ora per sistemare il Vault dopo pranzo
Candidate: create_calendar_event, title="Sistemare il Vault", date=tomorrow_local, duration_minutes=60, vague_time="dopo pranzo", missing_fields=["start_time"], confirmation_required=false.

User: antibiotico dopo cena
Candidate: create_memo, title="Prendere antibiotico", vague_time="dopo cena", missing_fields=["date","time"], confirmation_required=false.

User: ho speso tipo 30 euro per un tool AI, non so se ha senso
Candidate: null, because the user is discussing whether it makes sense and did not ask to log it.
`;

const PENDING_ACTION_SLOT_FILL_SYSTEM = `
You update a stored LifeOS pending action from the user's latest reply.
You are not answering the user and you are not executing tools.
Return strict JSON only. No markdown.

Schema:
{
  "relation": "field_update" | "confirmation" | "cancellation" | "unrelated",
  "args_patch": {},
  "missing_fields": [],
  "confirmation_required": true,
  "confirmation_question": "specific question or null",
  "reason": "short reason"
}

Rules:
- Use the existing pending action as source of truth.
- If the user gives missing date/time/title/category/etc., return field_update with args_patch.
- Do not discard already known fields.
- If the pending action has date/title/time already, do not ask for them again.
- "si", "yes", "fai oggi e il tempo te l'ho gia dato", "save it", "log it", "do it" can confirm the pending action.
- Negative or cancellation language is cancellation.
- If the reply changes topic, return unrelated.
- For time ranges like 14:30-15:30, return start_time and end_time.
- For Italian "stasera alle 21:30", return date=today_local and time/memo_time/start_time as appropriate.
`;

export function extractLatestPendingAction(brainChat) {
  const history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  const closed = new Set();
  const now = Date.now();
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const metadata = history[index]?.metadata ?? {};
    const candidates = [
      metadata.pending_action,
      metadata.working_context?.active_pending_action,
    ];
    for (const candidate of candidates) {
      const action = normalizePendingAction(candidate);
      if (!action?.id || closed.has(action.id)) continue;
      if (['completed', 'cancelled', 'expired'].includes(action.status)) {
        closed.add(action.id);
        continue;
      }
      if (isExpired(action, now)) {
        closed.add(action.id);
        continue;
      }
      if (isActivePendingStatus(action.status)) return action;
    }
  }
  return null;
}

export function normalizePendingReplyIntent(message) {
  const normalized = normalizeMessage(message);
  if (!normalized) return { intent: 'other', confidence: 0, normalized };

  if (/^\?+$/.test(normalized) || /^(?:cosa|cosa\?|che intendi|non ho capito|what|what\?|explain|spiega)\b/.test(normalized)) {
    return { intent: 'clarify', confidence: 0.9, normalized };
  }

  if (/\b(?:non farlo|non salvare|non registrare|non segnare|non segnarlo|non salvarlo|non bloccare|non creare|non crearlo|don't|do not|dont|don't save|don't log)\b/.test(normalized)
    || /^(?:no|annulla|cancella|cancel|stop|aspetta|lascia stare|lascia perdere|come non detto|nevermind|never mind)\b/.test(normalized)) {
    return { intent: 'cancel', confidence: 0.95, normalized };
  }

  if (/^(?:si|sii|s|y|yes|yep|yeah|ok|okay|certo|confermo|conferma|confirmed|confirm|va bene|procedi|fallo|salva|salvalo|segna|segnalo|registralo|log it|save it|do it|proceed|correct|esatto|giusto)\b/.test(normalized)
    || /\b(?:fai oggi|fallo pure|procedi pure|tempo te l'ho gia dato|data e il tempo|time is already there|salva alle|registralo alle|conferma inizio|confermo inizio)\b/.test(normalized)) {
    return { intent: 'confirm', confidence: 0.95, normalized };
  }

  return { intent: 'other', confidence: 0.2, normalized };
}

export function isPendingActionConfirmation(message) {
  return normalizePendingReplyIntent(message).intent === 'confirm';
}

export function isPendingActionCancellation(message) {
  return normalizePendingReplyIntent(message).intent === 'cancel';
}

export async function resolvePendingActionTurn({ message, pendingAction, context } = {}) {
  if (!pendingAction) return { handled: false };
  const replyIntent = normalizePendingReplyIntent(message);
  if (replyIntent.intent === 'cancel') {
    return {
      handled: true,
      type: 'cancelled',
      answer: formatPendingActionCancelledAnswer(pendingAction),
      pending_action: markPendingActionCancelled(pendingAction),
    };
  }

  if (replyIntent.intent === 'clarify') {
    return {
      handled: true,
      type: 'ask',
      answer: formatPendingActionClarificationAnswer(pendingAction),
      pending_action: pendingAction,
    };
  }

  if (replyIntent.intent === 'confirm') {
    const validation = validatePendingActionCandidate(pendingAction, context);
    if (validation.executable) {
      return { handled: true, type: 'execute', pending_action: pendingAction };
    }
    const next = {
      ...pendingAction,
      status: 'awaiting_fields',
      missing_fields: validation.missing_fields,
      confirmation_question: validation.question || pendingAction.confirmation_question || formatPendingActionQuestion(pendingAction),
    };
    return {
      handled: true,
      type: 'ask',
      answer: next.confirmation_question,
      pending_action: next,
    };
  }

  const update = await extractPendingActionFieldUpdateWithAI({ message, pendingAction, context });
  if (!update || update.relation === 'unrelated') return { handled: false };
  if (update.relation === 'cancellation') {
    return {
      handled: true,
      type: 'cancelled',
      answer: formatPendingActionCancelledAnswer(pendingAction),
      pending_action: markPendingActionCancelled(pendingAction),
    };
  }
  if (update.relation === 'confirmation') {
    const validation = validatePendingActionCandidate(pendingAction, context);
    if (validation.executable) return { handled: true, type: 'execute', pending_action: pendingAction };
  }

  const merged = normalizePendingAction({
    ...pendingAction,
    args: {
      ...safeObject(pendingAction.args),
      ...safeObject(update.args_patch),
    },
    missing_fields: Array.isArray(update.missing_fields) ? update.missing_fields : pendingAction.missing_fields,
    confirmation_required: update.confirmation_required ?? pendingAction.confirmation_required,
    confirmation_question: update.confirmation_question || pendingAction.confirmation_question,
  });
  const validation = validatePendingActionCandidate(merged, context);
  if (validation.executable && !merged.confirmation_required) {
    return { handled: true, type: 'execute', pending_action: merged };
  }
  if (validation.executable && merged.confirmation_required) {
    const next = {
      ...merged,
      status: 'awaiting_confirmation',
      missing_fields: [],
      confirmation_question: merged.confirmation_question || formatPendingActionQuestion(merged),
    };
    return { handled: true, type: 'ask', answer: next.confirmation_question, pending_action: next };
  }
  const next = {
    ...merged,
    status: 'awaiting_fields',
    missing_fields: validation.missing_fields,
    confirmation_question: validation.question || merged.confirmation_question || formatPendingActionQuestion(merged),
  };
  return { handled: true, type: 'ask', answer: next.confirmation_question, pending_action: next };
}

export async function extractPendingActionCandidateWithAI({ message, context, brainSkill, brainRoute } = {}) {
  const raw = await generateGeminiJson({
    system: PENDING_ACTION_EXTRACTOR_SYSTEM,
    prompt: JSON.stringify({
      today: localDate(),
      tomorrow: addDays(localDate(), 1),
      currentTime: localTime(),
      timeZone: 'Europe/Rome',
      userMessage: message,
      selectedSkill: brainSkill?.skill?.id || brainSkill?.id || null,
      brainRoute: brainRoute ? {
        mode: brainRoute.mode,
        primary_skill: brainRoute.primary_skill,
        write_intent: brainRoute.write_intent,
        needs_clarification: brainRoute.needs_clarification,
        user_intent_summary: brainRoute.user_intent_summary,
      } : null,
    }),
    temperature: 0,
    invalidMessage: 'Gemini returned an invalid pending action candidate.',
    repair: true,
  });
  return validatePendingActionCandidate(raw?.candidate ?? null, context);
}

export function validatePendingActionCandidate(candidate, context = {}) {
  const action = normalizePendingAction(candidate);
  if (!action) return { ok: false, reason: 'No pending action candidate.' };
  if (!SUPPORTED_ACTIONS.has(action.action_type)) return { ok: false, reason: 'Unsupported pending action type.' };
  if (action.risk_level === 'high') return { ok: false, reason: 'High-risk pending actions are not supported.' };
  const threshold = action.risk_level === 'medium' ? MEDIUM_RISK_THRESHOLD : LOW_RISK_THRESHOLD;
  if (action.confidence < threshold) return { ok: false, reason: 'Pending action confidence is too low.' };

  const normalizedArgs = normalizePendingArgs(action.action_type, action.args);
  const missing = normalizeMissingFields(action.action_type, normalizedArgs, action.missing_fields);
  const executable = missing.length === 0;
  const status = executable
    ? (action.confirmation_required ? 'awaiting_confirmation' : action.status)
    : 'awaiting_fields';
  const normalized = {
    ...action,
    status: action.status?.startsWith('awaiting') ? status : action.status,
    args: normalizedArgs,
    missing_fields: missing,
    confirmation_question: action.confirmation_question || questionForMissing(action, missing),
  };
  return {
    ok: true,
    candidate: normalized,
    executable,
    missing_fields: missing,
    question: normalized.confirmation_question,
  };
}

export function buildPendingActionFromCandidate({ candidate, message, context } = {}) {
  const validation = validatePendingActionCandidate(candidate, context);
  if (!validation.ok) return null;
  const action = validation.candidate;
  const now = new Date();
  return {
    ...action,
    id: action.id || context?.requestId || randomId(),
    status: validation.executable && action.confirmation_required ? 'awaiting_confirmation' : 'awaiting_fields',
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + PENDING_ACTION_TTL_HOURS * 60 * 60 * 1000).toISOString(),
    source_user_message_id: context?.brainChat?.userMessage?.id || action.source_user_message_id || null,
    source_user_message: String(message ?? '').slice(0, 1200),
  };
}

export function markPendingActionCompleted(pendingAction) {
  return {
    ...pendingAction,
    status: 'completed',
    completed_at: new Date().toISOString(),
  };
}

export function markPendingActionCancelled(pendingAction) {
  return {
    ...pendingAction,
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
  };
}

export function formatPendingActionQuestion(pendingAction) {
  if (pendingAction?.confirmation_question) return pendingAction.confirmation_question;
  const language = pendingAction?.language === 'it' ? 'it' : 'en';
  if (pendingAction?.action_type === 'log_sleep_start' && !pendingAction?.missing_fields?.length) {
    const time = pendingAction.args?.time || pendingAction.args?.sleep_start || pendingAction.summary;
    return language === 'it'
      ? `Confermi che devo registrare l'inizio del sonno alle ${time}?`
      : `Confirm sleep start at ${time}?`;
  }
  if (pendingAction?.missing_fields?.length) {
    return language === 'it'
      ? `Mi manca: ${pendingAction.missing_fields.join(', ')}. Che valore devo usare?`
      : `I am missing: ${pendingAction.missing_fields.join(', ')}. What should I use?`;
  }
  return language === 'it'
    ? `Vuoi che proceda con: ${pendingAction?.summary || 'questa azione'}?`
    : `Do you want me to proceed with: ${pendingAction?.summary || 'this action'}?`;
}

function formatPendingActionClarificationAnswer(pendingAction) {
  const language = pendingAction?.language === 'it' ? 'it' : 'en';
  if (pendingAction?.action_type === 'log_sleep_start') {
    const time = pendingAction.args?.time || pendingAction.args?.sleep_start || pendingAction.summary;
    return language === 'it'
      ? `Ti sto chiedendo conferma per registrare l'inizio del sonno alle ${time}. Rispondi "sì" per salvarlo o "no" per annullare.`
      : `I am asking you to confirm sleep start at ${time}. Reply "yes" to save it or "no" to cancel.`;
  }
  const summary = pendingAction?.summary || pendingAction?.action_type || 'questa azione';
  return language === 'it'
    ? `Ti sto chiedendo conferma per: ${summary}. Rispondi "sì" per procedere o "no" per annullare.`
    : `I am asking you to confirm: ${summary}. Reply "yes" to proceed or "no" to cancel.`;
}

export function formatPendingActionCompletedAnswer(result, pendingAction) {
  const language = pendingAction?.language === 'it' ? 'it' : 'en';
  if (pendingAction?.action_type === 'log_sleep_start') {
    const item = result?.data || result;
    const time = item?.sleep_start || pendingAction.args?.time || pendingAction.args?.sleep_start;
    return language === 'it' ? `Salvato: inizio sonno alle ${time}.` : `Saved: sleep start at ${time}.`;
  }
  if (pendingAction?.action_type === 'update_health_log') {
    const detail = pendingAction.args?.health_note_append || pendingAction.summary || 'log salute';
    return language === 'it' ? `Salvato nella salute: ${detail}.` : `Saved to Health: ${detail}.`;
  }
  if (pendingAction?.action_type === 'create_calendar_event') {
    const item = result?.data || result;
    return language === 'it'
      ? `Creato evento: ${item?.title || pendingAction.summary}.`
      : `Created event: ${item?.title || pendingAction.summary}.`;
  }
  if (pendingAction?.action_type === 'create_memo') {
    const item = result?.data || result;
    return language === 'it'
      ? `Creato promemoria: ${item?.title || pendingAction.summary}.`
      : `Created reminder: ${item?.title || pendingAction.summary}.`;
  }
  return language === 'it' ? 'Fatto.' : 'Done.';
}

export function formatPendingActionCancelledAnswer(pendingAction) {
  if (pendingAction?.language === 'it') {
    if (pendingAction.action_type === 'create_calendar_event') return 'Ricevuto. Nessun evento creato.';
    if (pendingAction.action_type === 'create_memo') return 'Ricevuto. Nessun promemoria creato.';
    if (pendingAction.action_type === 'log_sleep_start') return 'Ricevuto. Non ho salvato nulla.';
    if (pendingAction.action_type === 'update_health_log') return 'Ricevuto. Non ho salvato nulla in Salute.';
    return 'Ricevuto. Non ho creato nulla.';
  }
  if (pendingAction?.action_type === 'create_calendar_event') return 'Got it. No event created.';
  if (pendingAction?.action_type === 'create_memo') return 'Got it. No reminder created.';
  if (pendingAction?.action_type === 'log_sleep_start') return 'Got it. I did not save anything.';
  if (pendingAction?.action_type === 'update_health_log') return 'Got it. Nothing was saved to Health.';
  return 'Got it. I did not create anything.';
}

async function extractPendingActionFieldUpdateWithAI({ message, pendingAction, context } = {}) {
  try {
    const raw = await generateGeminiJson({
      system: PENDING_ACTION_SLOT_FILL_SYSTEM,
      prompt: JSON.stringify({
        today: localDate(),
        tomorrow: addDays(localDate(), 1),
        currentTime: localTime(),
        timeZone: 'Europe/Rome',
        pendingAction,
        workingContext: context?.workingContext ? {
          language: context.workingContext.language,
          last_subject: context.workingContext.last_subject,
          last_action_result: context.workingContext.last_action_result,
        } : null,
        userMessage: message,
      }),
      temperature: 0,
      invalidMessage: 'Gemini returned an invalid pending action slot update.',
      repair: true,
    });
    const update = normalizeFieldUpdate(raw);
    if (update.relation !== 'unrelated') return update;
    return localFieldUpdateFallback(message, pendingAction, context?.workingContext);
  } catch {
    return localFieldUpdateFallback(message, pendingAction, context?.workingContext);
  }
}

function normalizeFieldUpdate(raw) {
  const relation = ['field_update', 'confirmation', 'cancellation', 'unrelated'].includes(raw?.relation) ? raw.relation : 'unrelated';
  return {
    relation,
    args_patch: safeObject(raw?.args_patch),
    missing_fields: Array.isArray(raw?.missing_fields) ? raw.missing_fields.map(cleanField).filter(Boolean) : [],
    confirmation_required: typeof raw?.confirmation_required === 'boolean' ? raw.confirmation_required : undefined,
    confirmation_question: cleanText(raw?.confirmation_question, 400),
    reason: cleanText(raw?.reason, 300),
  };
}

function localFieldUpdateFallback(message, pendingAction, workingContext = null) {
  const text = String(message ?? '');
  const normalized = normalizeMessage(text);
  const subject = workingContext?.last_subject;
  if (subject && /\b(?:stesso orario|same time|come prima|gia usato|hai gia usato|tempo che hai gia usato|data e il tempo)\b/.test(normalized)) {
    const patch = {};
    if (pendingAction.action_type === 'create_calendar_event') {
      if (subject.date) patch.event_date = subject.date;
      if (subject.start_time) patch.start_time = subject.start_time;
      if (subject.end_time) patch.end_time = subject.end_time;
      if (!pendingAction.args?.title && subject.label) patch.title = subject.label;
    }
    if (pendingAction.action_type === 'create_memo') {
      if (subject.date) patch.memo_date = subject.date;
      if (subject.start_time) patch.memo_time = subject.start_time;
      if (!pendingAction.args?.title && subject.label) patch.title = subject.label;
    }
    if (Object.keys(patch).length) {
      return { relation: 'field_update', args_patch: patch, missing_fields: [], confirmation_required: false };
    }
  }
  const timeRange = text.match(/\b(\d{1,2}(?::|\.)(?:[0-5]\d)|\d{1,2})\s*(?:-|–|to|alle|a)\s*(\d{1,2}(?::|\.)(?:[0-5]\d)|\d{1,2})(?:\s*(am|pm|di sera))?\b/i);
  if (timeRange) {
    const start = normalizeSimpleTime(timeRange[1], timeRange[3]);
    const end = normalizeSimpleTime(timeRange[2], timeRange[3]);
    if (pendingAction.action_type === 'create_calendar_event') {
      return { relation: 'field_update', args_patch: { start_time: start, end_time: end }, missing_fields: [], confirmation_required: false };
    }
    if (pendingAction.action_type === 'create_memo') {
      return { relation: 'field_update', args_patch: { memo_time: start, time: start }, missing_fields: [], confirmation_required: false };
    }
  }
  const singleTime = text.match(/\b(\d{1,2}(?::|\.)(?:[0-5]\d)|\d{1,2})\s*(am|pm)?\b/i);
  if (singleTime && pendingAction.action_type === 'log_sleep_start') {
    const time = normalizeSimpleTime(singleTime[1], singleTime[2]);
    if (time) return { relation: 'field_update', args_patch: { time }, missing_fields: [], confirmation_required: true };
  }
  return { relation: 'unrelated', args_patch: {}, missing_fields: [] };
}

function normalizePendingAction(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rawArgs = safeObject(value.args);
  let actionType = String(value.action_type ?? value.intent ?? '').trim();
  if (actionType === 'update_health_log'
    && (rawArgs.time || rawArgs.sleep_start || rawArgs.sleepStart)
    && !rawArgs.wake_time
    && !rawArgs.health_note_append
    && !rawArgs.notes) {
    actionType = 'log_sleep_start';
  }
  if (!actionType || actionType === 'unsupported') return null;
  return {
    id: cleanText(value.id, 120),
    status: cleanText(value.status, 40) || 'awaiting_confirmation',
    created_at: cleanText(value.created_at, 80),
    expires_at: cleanText(value.expires_at, 80),
    source_user_message_id: cleanText(value.source_user_message_id, 120),
    source_user_message: cleanText(value.source_user_message, 1200),
    skill: cleanText(value.skill, 80),
    intent: actionType,
    action_type: actionType,
    summary: cleanText(value.summary, 300) || actionType,
    args: rawArgs,
    missing_fields: Array.isArray(value.missing_fields) ? value.missing_fields.map(cleanField).filter(Boolean) : [],
    confirmation_required: value.confirmation_required !== false,
    confirmation_question: cleanText(value.confirmation_question, 500),
    language: value.language === 'it' ? 'it' : 'en',
    risk_level: ['low', 'medium', 'high'].includes(value.risk_level) ? value.risk_level : 'low',
    confidence: clampNumber(value.confidence, 0, 1, 0.8),
    reason: cleanText(value.reason, 400),
  };
}

function normalizePendingArgs(actionType, args) {
  const source = safeObject(args);
  if (source.date === 'today_local' || source.logged_on === 'today_local') source.logged_on = localDate();
  if (source.date === 'tomorrow_local' || source.logged_on === 'tomorrow_local') source.logged_on = addDays(localDate(), 1);
  if (source.event_date === 'today_local') source.event_date = localDate();
  if (source.event_date === 'tomorrow_local') source.event_date = addDays(localDate(), 1);
  if (source.memo_date === 'today_local') source.memo_date = localDate();
  if (source.memo_date === 'tomorrow_local') source.memo_date = addDays(localDate(), 1);

  if (actionType === 'update_health_log') {
    const loggedOn = source.logged_on || source.date;
    return {
      ...source,
      logged_on: normalizeDateValue(loggedOn),
      health_note_append: cleanText(source.health_note_append, 800),
      nap_start_time: normalizeSimpleTime(source.nap_start_time),
      nap_end_time: normalizeSimpleTime(source.nap_end_time),
    };
  }
  if (actionType === 'log_sleep_start') {
    return {
      ...source,
      time: normalizeSimpleTime(source.time ?? source.sleep_start ?? source.sleepStart),
      logged_on: normalizeDateValue(source.logged_on || source.date),
      notes: cleanText(source.notes, 1000),
    };
  }
  if (actionType === 'create_calendar_event') {
    const date = source.event_date || source.date;
    let startTime = source.start_time;
    let endTime = source.end_time;
    if (startTime && !endTime && source.duration_minutes) {
      endTime = addMinutesToTime(normalizeSimpleTime(startTime), Number(source.duration_minutes));
    }
    return {
      ...source,
      title: cleanText(source.title ?? source.name, 160),
      event_date: normalizeDateValue(date),
      start_time: normalizeSimpleTime(startTime),
      end_time: normalizeSimpleTime(endTime),
      category: cleanText(source.category, 80),
      notes: cleanText(source.notes, 1000),
    };
  }
  if (actionType === 'create_memo') {
    const date = source.memo_date || source.date;
    return {
      ...source,
      title: cleanText(source.title ?? source.memo ?? source.reminder ?? source.task, 220),
      memo_date: date ? normalizeDateValue(date) : null,
      memo_time: normalizeSimpleTime(source.memo_time ?? source.time),
      notes: cleanText(source.notes, 1000),
    };
  }
  if (actionType === 'create_expense') {
    return {
      ...source,
      vendor: cleanText(source.vendor ?? source.merchant ?? source.name, 120),
      amount: source.amount,
      category: cleanText(source.category, 80),
      spent_on: normalizeDateValue(source.spent_on ?? source.date ?? 'today_local'),
      notes: cleanText(source.notes, 1000),
    };
  }
  return source;
}

function normalizeMissingFields(actionType, args, currentMissing = []) {
  const missing = new Set((Array.isArray(currentMissing) ? currentMissing : []).map(cleanField).filter(Boolean));
  if (actionType === 'update_health_log') {
    if (!args.logged_on) missing.add('date');
    if (!args.health_note_append && !args.notes && !args.coffee && !args.adc && !args.wake_time && !args.sleep_start) missing.add('health_field');
  }
  if (actionType === 'log_sleep_start') {
    if (!args.time) missing.add('time');
  }
  if (actionType === 'create_calendar_event') {
    if (!args.title) missing.add('title');
    if (!args.event_date) missing.add('date');
    if (!args.start_time) missing.add('start_time');
    if (!args.end_time) missing.add('end_time');
  }
  if (actionType === 'create_memo') {
    if (!args.title) missing.add('title');
    if (args.vague_time && !args.memo_time) missing.add('time');
  }
  if (actionType === 'create_expense') {
    if (!args.vendor) missing.add('vendor');
    if (!(Number(args.amount) > 0)) missing.add('amount');
    if (!args.category) missing.add('category');
  }
  for (const field of [...missing]) {
    if (field === 'date' && (args.logged_on || args.event_date || args.memo_date || args.spent_on)) missing.delete(field);
    if (field === 'time' && (args.memo_time || args.start_time)) missing.delete(field);
    if (field === 'time' && actionType === 'log_sleep_start' && args.time) missing.delete(field);
    if (field === 'start_time' && args.start_time) missing.delete(field);
    if (field === 'end_time' && args.end_time) missing.delete(field);
    if (field === 'title' && args.title) missing.delete(field);
    if (field === 'category' && args.category) missing.delete(field);
  }
  return [...missing];
}

function questionForMissing(action, missing) {
  if (!missing.length) return action.confirmation_question || formatPendingActionQuestion(action);
  const language = action.language === 'it' ? 'it' : 'en';
  if (action.action_type === 'create_calendar_event') {
    if (missing.includes('start_time') || missing.includes('end_time')) {
      return language === 'it'
        ? 'Che orario esatto devo usare? Per esempio 14:30-15:30.'
        : 'What exact time should I use? For example 14:30-15:30.';
    }
    if (missing.includes('date')) return language === 'it' ? 'Che giorno devo usare?' : 'What date should I use?';
  }
  if (action.action_type === 'create_memo') {
    if (missing.includes('title')) return language === 'it' ? 'Che promemoria devo creare?' : 'What reminder should I create?';
    if (missing.includes('time')) return language === 'it' ? 'Che giorno e orario devo usare?' : 'What date and time should I use?';
  }
  if (action.action_type === 'log_sleep_start') {
    if (missing.includes('time')) {
      return language === 'it'
        ? 'Che orario devo usare per l\'inizio del sonno?'
        : 'What time should I use for sleep start?';
    }
  }
  if (action.action_type === 'update_health_log') {
    return language === 'it' ? 'Che dettaglio devo salvare in Salute?' : 'What Health detail should I save?';
  }
  return formatPendingActionQuestion({ ...action, missing_fields: missing });
}

function normalizeDateValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value === 'today_local') return localDate();
  if (value === 'tomorrow_local') return addDays(localDate(), 1);
  try {
    return optionalDate({ value }, 'value', null);
  } catch {
    return null;
  }
}

function normalizeSimpleTime(value, suffix = '') {
  if (value === undefined || value === null || value === '') return null;
  let text = String(value).trim().toLowerCase().replace('.', ':');
  if (suffix) text = `${text} ${suffix}`;
  try {
    const { startTime } = normalizeTimeRange({ start_time: text, end_time: '23:59' }, 'start_time', 'end_time');
    return startTime;
  } catch {
    const match = text.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm|di sera)?$/);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    const period = match[3] || '';
    if ((period === 'pm' || period === 'di sera') && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
}

function addMinutesToTime(time, minutes) {
  if (!time || !Number.isFinite(Number(minutes))) return null;
  const [hour, minute] = time.split(':').map(Number);
  const total = hour * 60 + minute + Number(minutes);
  if (total <= 0 || total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function isExpired(action, now = Date.now()) {
  const expiresAt = Date.parse(action.expires_at || '');
  return Number.isFinite(expiresAt) && expiresAt < now;
}

function isActivePendingStatus(status) {
  return !status || ['open', 'pending', 'awaiting_confirmation', 'awaiting_fields'].includes(status);
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanText(value, max = 1000) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function cleanField(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^\w_]/g, '').slice(0, 80);
}

function normalizeMessage(value) {
  return String(value ?? '')
    .replace(/['\u2019]/g, "'")
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

function randomId() {
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
