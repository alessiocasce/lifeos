import { generateGeminiJson } from './gemini.js';
import { addDays, localDate } from './date.js';
import { normalizeTimeRange, optionalDate } from './validation.js';
import {
  buildCommandContextForPrompt,
  formatReferentClarification,
  resolveSimpleReferent,
} from './brainWorkingContext.js';
import {
  coercePendingActionType,
  extractSleepStartTimeFromArgs,
} from './brainPendingActions.js';

const SUPPORTED_ACTIONS = new Set(['create_calendar_event', 'create_memo', 'create_expense', 'update_health_log', 'log_sleep_start']);
const COMMAND_MODES = new Set(['answer', 'action', 'clarify', 'cancel', 'field_update', 'transform', 'memory', 'unsupported']);

const COMMAND_DRAFT_SYSTEM = `
You are the LifeOS Brain Command Draft extractor.
You are not answering the user and you are not executing tools.
Convert the user's message into strict JSON only. No markdown.

Schema:
{
  "mode": "answer" | "action" | "clarify" | "cancel" | "field_update" | "transform" | "memory" | "unsupported",
  "skill": "health_coach",
  "language": "it",
  "intent_summary": "short summary",
  "referent": {
    "needed": true,
    "resolved": true,
    "source": "last_subject",
    "confidence": 0.92,
    "reason": "short reason"
  },
  "action": {
    "type": "create_calendar_event" | "update_health_log" | "log_sleep_start" | "create_memo" | "create_expense" | "unsupported" | null,
    "args": {},
    "missing_fields": [],
    "confirmation_required": false,
    "risk_level": "low"
  },
  "clarification_question": null,
  "confidence": 0.0,
  "reason": "short reason"
}

Rules:
- Use workingContext to resolve references like it, that, this, same, same time, also, add it too, lo, questo, quello, stessa cosa, stesso orario, anche, anche li, mettilo, aggiungilo, spostalo.
- If workingContext has one clear last_subject and the user uses a pronoun/referential instruction, resolve it.
- If multiple plausible referents exist, use mode "clarify" and ask a specific disambiguation question.
- If no referent exists, use mode "clarify" and ask what the user means.
- Do not invent fields not present in the message or workingContext.
- Do not execute destructive actions.
- If user says not to create/log/save, mode must be "cancel" or "answer" with no action.
- If message is read-only analysis, mode "answer".
- If message is a follow-up transform, mode "transform".
- If message is an explicit memory command, mode "memory".
- If a supported action is complete, mode "action".
- If a supported action is missing fields, mode "clarify".
- Use the conversation language from workingContext unless the current user message clearly switches language.
- Going to sleep / bedtime / inizio sonno / vado a dormire / sto andando a letto / sleep start messages map to action.type "log_sleep_start" with args.time in HH:MM. Do not map them to a generic Health note.

Examples:
Working context last_subject: health_event Pisolino today 19:40-22:00.
User: aggiungilo anche al calendario
Output: mode action, action.type create_calendar_event, args title Pisolino, event_date from last_subject, start_time 19:40, end_time 22:00, category Health, notes "Creato dal pisolino salvato in Salute", referent resolved true.

Working context last_subject: health_event Pisolino today 19:40-22:00.
User: crea anche un memo con lo stesso orario
Output: mode action, action.type create_memo, args title Pisolino, memo_date from last_subject, memo_time 19:40, referent resolved true.

Working context last_subject: health_event Pisolino.
User: spostalo a domani
Output: mode unsupported or clarify, because moving a Health note is ambiguous and update_calendar_event is not available.

Multiple recent subjects.
User: aggiungilo anche al calendario
Output: mode clarify, question "Intendi il pisolino 19:40-22:00 o il promemoria antibiotico?"

No referent exists.
User: aggiungilo anche al calendario
Output: mode clarify, question "Che cosa vuoi aggiungere al calendario?"

Working context has date/time already.
User: la data e il tempo che hai gia usato
Output: mode field_update or action using previous pending action/last_subject; do not ask again for date/time if they exist.

User: Segna che sto andando a dormire ora alle 3.41am
Output: mode action, skill health_coach, action.type log_sleep_start, args time "03:41", missing_fields [], confirmation_required false or true depending safety.
`;

export async function extractBrainCommandDraftWithAI({ message, brainRoute, brainSkill, workingContext, lifeosContext = null } = {}) {
  const raw = await generateGeminiJson({
    system: COMMAND_DRAFT_SYSTEM,
    prompt: JSON.stringify({
      today: localDate(),
      tomorrow: addDays(localDate(), 1),
      timeZone: 'Europe/Rome',
      userMessage: message,
      brainRoute: brainRoute ? {
        mode: brainRoute.mode,
        primary_skill: brainRoute.primary_skill,
        write_intent: brainRoute.write_intent,
        user_intent_summary: brainRoute.user_intent_summary,
        needs_clarification: brainRoute.needs_clarification,
      } : null,
      brainSkill: brainSkill?.skill?.id || brainSkill?.id || null,
      workingContext: buildCommandContextForPrompt(workingContext),
      lifeosContextAvailable: Boolean(lifeosContext),
    }),
    temperature: 0,
    invalidMessage: 'Gemini returned an invalid Brain command draft.',
    repair: true,
  });
  return normalizeCommandDraft(raw, workingContext);
}

export function validateBrainCommandDraft(commandDraft, { workingContext, brainRoute, brainSkill } = {}) {
  const draft = resolveCommandDraftReferences(normalizeCommandDraft(commandDraft, workingContext), workingContext);
  if (!draft) return { ok: false, reason: 'No command draft.' };
  if (draft.mode === 'cancel') return { ok: true, draft, executable: false, cancelled: true };
  if (['answer', 'transform', 'memory', 'unsupported'].includes(draft.mode)) return { ok: true, draft, executable: false };
  const actionType = draft.action?.type;
  if (!actionType || actionType === 'unsupported') {
    return { ok: true, draft: { ...draft, mode: 'unsupported' }, executable: false };
  }
  if (!SUPPORTED_ACTIONS.has(actionType)) return { ok: false, reason: 'Unsupported command draft action.' };
  if (draft.action.risk_level === 'high') return { ok: false, reason: 'High-risk command drafts are not supported.' };
  if (draft.confidence < 0.68 || (draft.referent?.needed && !draft.referent?.resolved)) {
    return {
      ok: true,
      draft: {
        ...draft,
        mode: 'clarify',
        clarification_question: draft.clarification_question || formatReferentClarification({ workingContext, language: draft.language }),
      },
      executable: false,
    };
  }
  const args = normalizeActionArgs(actionType, draft.action.args);
  const missing = normalizeMissingFields(actionType, args, draft.action.missing_fields);
  const normalized = {
    ...draft,
    action: {
      ...draft.action,
      args,
      missing_fields: missing,
      confirmation_required: Boolean(draft.action.confirmation_required),
    },
  };
  if (missing.length) {
    return {
      ok: true,
      draft: {
        ...normalized,
        mode: 'clarify',
        clarification_question: normalized.clarification_question || questionForMissing(normalized, workingContext),
      },
      executable: false,
      missing_fields: missing,
    };
  }
  const routeWrite = Boolean(brainRoute?.write_intent || normalized.mode === 'action');
  const skillId = brainSkill?.skill?.id || brainSkill?.id || normalized.skill;
  return {
    ok: true,
    draft: normalized,
    executable: normalized.mode === 'action' && routeWrite && Boolean(skillId),
    missing_fields: [],
  };
}

export function resolveCommandDraftReferences(commandDraft, workingContext) {
  if (!commandDraft) return null;
  const draft = normalizeCommandDraft(commandDraft, workingContext);
  const subject = workingContext?.last_subject;
  if (!subject || !draft.action?.type) return draft;
  if (draft.referent?.needed && !draft.referent?.resolved) return draft;
  const args = { ...(draft.action.args ?? {}) };
  if (draft.action.type === 'create_calendar_event') {
    if (!args.title) args.title = subject.label;
    if (!args.event_date && subject.date) args.event_date = subject.date;
    if (!args.start_time && subject.start_time) args.start_time = subject.start_time;
    if (!args.end_time && subject.end_time) args.end_time = subject.end_time;
    if (!args.category && subject.type === 'health_event') args.category = 'Health';
    if (!args.notes && subject.source === 'health_log_note') args.notes = `Creato da ${subject.label} salvato in Salute`;
  }
  if (draft.action.type === 'create_memo') {
    if (!args.title) args.title = subject.label;
    if (!args.memo_date && subject.date) args.memo_date = subject.date;
    if (!args.memo_time && subject.start_time) args.memo_time = subject.start_time;
    if (!args.notes && subject.end_time) args.notes = `${subject.label}: ${subject.start_time || ''}-${subject.end_time}`;
  }
  return {
    ...draft,
    action: {
      ...draft.action,
      args,
    },
  };
}

export function commandDraftToPendingAction(commandDraft, context = {}) {
  const draft = normalizeCommandDraft(commandDraft, context?.workingContext);
  if (!draft?.action?.type || !SUPPORTED_ACTIONS.has(draft.action.type)) return null;
  return {
    id: context?.requestId || `command-${Date.now()}`,
    status: draft.action?.missing_fields?.length ? 'awaiting_fields' : 'awaiting_confirmation',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    source_user_message_id: context?.brainChat?.userMessage?.id || null,
    source_user_message: String(context?.message ?? '').slice(0, 1200),
    skill: draft.skill,
    intent: draft.action.type,
    action_type: draft.action.type,
    summary: draft.intent_summary,
    args: draft.action.args ?? {},
    missing_fields: draft.action.missing_fields ?? [],
    confirmation_required: Boolean(draft.action.confirmation_required),
    confirmation_question: draft.clarification_question || questionForMissing(draft, context?.workingContext),
    language: draft.language,
    risk_level: draft.action.risk_level || 'low',
    confidence: draft.confidence,
    reason: draft.reason,
  };
}

export function commandDraftToPlannerPlan(commandDraft) {
  const draft = normalizeCommandDraft(commandDraft);
  const intent = draft?.action?.type;
  return {
    intent,
    needsRead: false,
    needsWrite: Boolean(intent && SUPPORTED_ACTIONS.has(intent)),
    range: null,
    tables: tableForAction(intent),
    args: draft?.action?.args ?? {},
    clarifyingQuestion: draft?.mode === 'clarify' ? draft.clarification_question : null,
    riskLevel: draft?.action?.risk_level || 'low',
    reason: draft?.reason || draft?.intent_summary || 'Brain command draft.',
  };
}

export function formatCommandDraftClarification(commandDraft, workingContext) {
  const draft = normalizeCommandDraft(commandDraft, workingContext);
  if (draft?.clarification_question) return draft.clarification_question;
  return questionForMissing(draft, workingContext);
}

export function shouldUseCommandDraft({ message, brainRoute, brainSkill, workingContext } = {}) {
  const text = normalizeText(message);
  if (!text) return false;
  if (brainRoute?.mode && ['memory_write', 'memory_recall', 'memory_forget', 'follow_up_transform', 'read_only_analysis'].includes(brainRoute.mode)) return false;
  if (/\b(?:delete|remove|wipe|erase|destroy|elimina|cancella|rimuovi)\b/.test(text)) return false;
  const hasReferent = /\b(?:it|this|that|same|also|too|lo|la|questo|questa|quello|quella|stesso|stessa|orario|tempo|anche|li|lì|aggiungilo|mettilo|usato|prima)\b/.test(text);
  const actionLike = /\b(?:add|put|create|log|save|schedule|remind|aggiungi|aggiungilo|metti|mettilo|crea|segna|salva|ricordami|blocca|calendario|memo|promemoria|dormire|letto|sonno|bedtime|sleep start)\b/.test(text);
  const skillId = brainSkill?.skill?.id || brainSkill?.id || brainRoute?.primary_skill;
  if (hasReferent && workingContext?.last_subject) return true;
  if (brainRoute?.mode === 'clarification') return true;
  return actionLike && ['health_coach', 'calendar_planner', 'memo_assistant', 'finance_analyst', 'project_ops_coach'].includes(skillId);
}

function normalizeCommandDraft(raw, workingContext = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const mode = COMMAND_MODES.has(raw.mode) ? raw.mode : 'unsupported';
  const language = raw.language === 'en' || raw.language === 'it'
    ? raw.language
    : (workingContext?.language === 'it' ? 'it' : 'en');
  const rawActionArgs = safeObject(raw.action?.args);
  const rawActionType = cleanText(raw.action?.type, 80);
  const actionType = coercePendingActionType(rawActionType, rawActionArgs, {
    summary: raw.intent_summary || raw.reason,
    source_user_message: null,
  });
  let actionArgs = rawActionArgs;
  if (actionType === 'log_sleep_start') {
    const time = extractSleepStartTimeFromArgs(rawActionArgs);
    actionArgs = {
      ...rawActionArgs,
      ...(time ? { time } : {}),
      logged_on: rawActionArgs.logged_on ?? rawActionArgs.date,
    };
  }
  let clarificationQuestion = cleanText(raw.clarification_question, 500);
  if (actionType === 'log_sleep_start' && isGenericDetailQuestion(clarificationQuestion)) clarificationQuestion = null;
  const action = raw.action && typeof raw.action === 'object' && !Array.isArray(raw.action)
    ? {
      type: actionType,
      args: actionArgs,
      missing_fields: Array.isArray(raw.action.missing_fields) ? raw.action.missing_fields.map(cleanField).filter(Boolean) : [],
      confirmation_required: Boolean(raw.action.confirmation_required),
      risk_level: ['low', 'medium', 'high'].includes(raw.action.risk_level) ? raw.action.risk_level : 'low',
    }
    : { type: null, args: {}, missing_fields: [], confirmation_required: false, risk_level: 'low' };
  return {
    mode,
    skill: cleanText(raw.skill, 80) || null,
    language,
    intent_summary: cleanText(raw.intent_summary, 300),
    referent: raw.referent && typeof raw.referent === 'object' ? {
      needed: Boolean(raw.referent.needed),
      resolved: Boolean(raw.referent.resolved),
      source: cleanText(raw.referent.source, 80),
      confidence: clampNumber(raw.referent.confidence, 0, 1, 0),
      reason: cleanText(raw.referent.reason, 300),
    } : { needed: false, resolved: false, source: null, confidence: 0, reason: null },
    action,
    clarification_question: clarificationQuestion,
    confidence: clampNumber(raw.confidence, 0, 1, 0),
    reason: cleanText(raw.reason, 500),
  };
}

function normalizeActionArgs(actionType, args) {
  const source = safeObject(args);
  if (actionType === 'create_calendar_event') {
    return {
      ...source,
      title: cleanText(source.title, 180),
      event_date: normalizeDateValue(source.event_date || source.date),
      start_time: normalizeSimpleTime(source.start_time),
      end_time: normalizeSimpleTime(source.end_time),
      category: cleanText(source.category, 80),
      notes: cleanText(source.notes, 1000),
    };
  }
  if (actionType === 'create_memo') {
    return {
      ...source,
      title: cleanText(source.title, 220),
      memo_date: normalizeDateValue(source.memo_date || source.date),
      memo_time: normalizeSimpleTime(source.memo_time || source.time),
      notes: cleanText(source.notes, 1000),
    };
  }
  if (actionType === 'update_health_log') {
    return {
      ...source,
      logged_on: normalizeDateValue(source.logged_on || source.date),
      notes: cleanText(source.notes, 1200),
      health_note_append: cleanText(source.health_note_append, 800),
      nap_start_time: normalizeSimpleTime(source.nap_start_time),
      nap_end_time: normalizeSimpleTime(source.nap_end_time),
    };
  }
  if (actionType === 'log_sleep_start') {
    return {
      time: normalizeSimpleTime(source.time || source.sleep_start || source.sleepStart || source.start_time || source.bedtime || source.value),
      logged_on: normalizeDateValue(source.logged_on || source.date),
      notes: cleanText(source.notes, 1000),
    };
  }
  if (actionType === 'create_expense') {
    return {
      ...source,
      vendor: cleanText(source.vendor, 160),
      amount: source.amount,
      category: cleanText(source.category, 80),
      spent_on: normalizeDateValue(source.spent_on || source.date || 'today_local'),
      notes: cleanText(source.notes, 1000),
    };
  }
  return source;
}

function normalizeMissingFields(actionType, args, currentMissing = []) {
  const missing = new Set((Array.isArray(currentMissing) ? currentMissing : []).map(cleanField).filter(Boolean));
  if (actionType === 'create_calendar_event') {
    if (!args.title) missing.add('title');
    if (!args.event_date) missing.add('date');
    if (!args.start_time) missing.add('start_time');
    if (!args.end_time) missing.add('end_time');
  }
  if (actionType === 'create_memo') {
    if (!args.title) missing.add('title');
    if (!args.memo_date) missing.add('date');
    if (!args.memo_time) missing.add('time');
  }
  if (actionType === 'update_health_log') {
    if (!args.logged_on) missing.add('date');
    if (!args.health_note_append && !args.notes && !args.wake_time && !args.sleep_start) missing.add('health_field');
  }
  if (actionType === 'log_sleep_start') {
    if (!args.time) missing.add('time');
  }
  if (actionType === 'create_expense') {
    if (!args.vendor) missing.add('vendor');
    if (!(Number(args.amount) > 0)) missing.add('amount');
    if (!args.category) missing.add('category');
  }
  return [...missing].filter((field) => {
    if (field === 'date' && (args.event_date || args.memo_date || args.logged_on || args.spent_on)) return false;
    if (field === 'time' && (args.memo_time || args.start_time || args.time)) return false;
    if (field === 'start_time' && args.start_time) return false;
    if (field === 'end_time' && args.end_time) return false;
    if (field === 'title' && args.title) return false;
    if (field === 'health_field' && actionType === 'log_sleep_start') return false;
    if (field === 'health_field' && (args.health_field || args.healthField || args.health_note_append || args.notes || args.wake_time || args.sleep_start || args.sleepStart)) return false;
    return true;
  });
}

function questionForMissing(draft, workingContext) {
  const language = draft?.language === 'it' || workingContext?.language === 'it' ? 'it' : 'en';
  const missing = draft?.action?.missing_fields ?? [];
  if (!missing.length && draft?.action?.type === 'log_sleep_start') {
    const time = draft.action.args?.time || draft.action.args?.sleep_start || draft.intent_summary;
    return language === 'it'
      ? `Confermi che devo registrare l'inizio del sonno alle ${time}?`
      : `Confirm sleep start at ${time}?`;
  }
  if (draft?.referent?.needed && !draft?.referent?.resolved) return formatReferentClarification({ workingContext, language });
  if (draft?.action?.type === 'create_calendar_event') {
    if (missing.includes('start_time') || missing.includes('end_time')) {
      return language === 'it' ? "Mi manca solo l'orario esatto. Quale uso?" : 'I only need the exact time. What should I use?';
    }
    if (missing.includes('date')) return language === 'it' ? 'Che data devo usare?' : 'What date should I use?';
  }
  if (draft?.action?.type === 'create_memo') {
    if (missing.includes('title')) return language === 'it' ? 'Che promemoria devo creare?' : 'What reminder should I create?';
    if (missing.includes('date') || missing.includes('time')) return language === 'it' ? 'Che giorno e orario devo usare?' : 'What date and time should I use?';
  }
  if (draft?.action?.type === 'log_sleep_start') {
    if (missing.includes('time')) {
      return language === 'it' ? "Mi manca solo l'orario di inizio sonno. Quale uso?" : 'I only need the sleep start time. What should I use?';
    }
  }
  return language === 'it' ? 'Che dettaglio devo usare?' : 'What detail should I use?';
}

function isGenericDetailQuestion(value) {
  const text = normalizeText(value);
  return Boolean(text && /\b(?:che dettaglio|quale dettaglio|what detail|what health detail|che valore)\b/.test(text));
}

function tableForAction(actionType) {
  if (actionType === 'create_calendar_event') return ['calendar_events'];
  if (actionType === 'create_memo') return ['memos'];
  if (actionType === 'create_expense') return ['expenses'];
  if (actionType === 'update_health_log') return ['health_logs'];
  if (actionType === 'log_sleep_start') return ['health_logs'];
  return [];
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

function normalizeSimpleTime(value) {
  if (value === undefined || value === null || value === '') return null;
  try {
    const { startTime } = normalizeTimeRange({ start_time: value, end_time: '23:59' }, 'start_time', 'end_time');
    return startTime;
  } catch {
    return null;
  }
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

function normalizeText(value) {
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
