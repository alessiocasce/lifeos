import { extractLatestPendingAction } from './brainPendingActions.js';

const SUBJECT_TYPES = new Set(['health_event', 'calendar_event', 'memo', 'expense', 'project_session', 'workout_set', 'generic']);

export function buildBrainWorkingContext({ brainChat, currentMessage, lifeosContext = null } = {}) {
  const language = extractConversationLanguage({ brainChat, currentMessage });
  const lastSubject = extractLatestOperationalSubject(brainChat);
  const lastActionResult = extractLatestActionResult(brainChat);
  const activePendingAction = extractLatestPendingAction(brainChat);
  const recentReferents = extractRecentReferents(brainChat);
  const pendingSubject = buildSubjectFromPendingAction(activePendingAction);
  const referents = dedupeSubjects([
    lastSubject ? { key: 'last_subject', ...lastSubject } : null,
    pendingSubject ? { key: 'active_pending_action', ...pendingSubject } : null,
    ...recentReferents,
  ].filter(Boolean)).slice(0, 8);
  return {
    language,
    last_subject: lastSubject,
    last_action_result: lastActionResult,
    referents,
    active_pending_action: activePendingAction,
    recent_subjects: recentReferents,
    lifeos_context_available: Boolean(lifeosContext),
  };
}

export function extractConversationLanguage({ brainChat, currentMessage } = {}) {
  const current = detectLanguage(currentMessage);
  if (current) return current;
  const history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const metadata = history[index]?.metadata ?? {};
    const language = metadata.working_context?.language || metadata.pending_action?.language;
    if (language === 'it' || language === 'en') return language;
  }
  const recentText = history.slice(-8).map((item) => item.content).join(' ');
  return detectLanguage(recentText) || 'en';
}

export function extractLatestOperationalSubject(brainChat) {
  const history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const metadata = history[index]?.metadata ?? {};
    const subject = normalizeSubject(metadata.working_context?.last_subject || metadata.last_subject);
    if (subject) return subject;
    const pendingSubject = buildSubjectFromPendingAction(metadata.pending_action);
    if (pendingSubject && ['completed', 'awaiting_confirmation', 'awaiting_fields'].includes(metadata.pending_action?.status)) return pendingSubject;
  }
  return null;
}

export function extractRecentReferents(brainChat) {
  const history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  const subjects = [];
  const seen = new Set();
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const metadata = history[index]?.metadata ?? {};
    const candidates = [
      metadata.working_context?.last_subject,
      metadata.last_subject,
      buildSubjectFromPendingAction(metadata.pending_action),
    ];
    for (const candidate of candidates) {
      const subject = normalizeSubject(candidate);
      if (!subject) continue;
      const key = [subject.type, subject.label, subject.date, subject.start_time, subject.end_time].filter(Boolean).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      subjects.push({ key: `recent_${subjects.length + 1}`, ...subject });
      if (subjects.length >= 6) return subjects;
    }
  }
  return subjects;
}

export function extractLatestActionResult(brainChat) {
  const history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const result = normalizeActionResult(history[index]?.metadata?.working_context?.last_action_result || history[index]?.metadata?.last_action_result);
    if (result) return result;
  }
  return null;
}

export function buildCommandContextForPrompt(workingContext) {
  if (!workingContext) return 'No working context is available.';
  return JSON.stringify({
    language: workingContext.language,
    last_subject: compactSubject(workingContext.last_subject),
    last_action_result: workingContext.last_action_result,
    referents: (workingContext.referents ?? []).map(compactSubject),
    active_pending_action: workingContext.active_pending_action ? {
      id: workingContext.active_pending_action.id,
      status: workingContext.active_pending_action.status,
      action_type: workingContext.active_pending_action.action_type,
      summary: workingContext.active_pending_action.summary,
      args: workingContext.active_pending_action.args,
      missing_fields: workingContext.active_pending_action.missing_fields,
    } : null,
  });
}

export function serializeWorkingContextForMetadata(workingContext) {
  if (!workingContext) return null;
  return {
    language: workingContext.language === 'it' ? 'it' : 'en',
    last_subject: normalizeSubject(workingContext.last_subject),
    last_action_result: normalizeActionResult(workingContext.last_action_result),
  };
}

export function mergeWorkingContextMetadata({ previousContext, update } = {}) {
  const previous = previousContext && typeof previousContext === 'object' ? previousContext : {};
  const next = update && typeof update === 'object' ? update : {};
  return {
    ...previous,
    ...next,
    last_subject: normalizeSubject(next.last_subject) || normalizeSubject(previous.last_subject),
    last_action_result: normalizeActionResult(next.last_action_result) || normalizeActionResult(previous.last_action_result),
  };
}

export function buildSubjectFromActionResult({ actionType, args = {}, result = {}, message = '', language = 'en' } = {}) {
  const data = result?.data && typeof result.data === 'object' ? result.data : result;
  const common = {
    id: data?.id || args?.id || null,
    source_action_id: args?.pending_action_id || args?.command_draft_id || null,
    created_by_last_action: true,
    confidence: 0.9,
    raw: compactRaw(data || args),
  };
  if (actionType === 'update_health_log') {
    const label = inferHealthLabel(args, data, language);
    return normalizeSubject({
      ...common,
      type: 'health_event',
      label,
      date: data?.logged_on || args?.logged_on || args?.date || null,
      start_time: args?.nap_start_time || args?.start_time || null,
      end_time: args?.nap_end_time || args?.end_time || null,
      source: 'health_log_note',
    });
  }
  if (actionType === 'log_sleep_start') {
    return normalizeSubject({
      ...common,
      type: 'health_event',
      label: language === 'it' ? 'Inizio sonno' : 'Sleep start',
      date: data?.sleep_start_logged_on || data?.health_log?.logged_on || args?.logged_on || args?.date || null,
      start_time: data?.sleep_start || args?.time || args?.sleep_start || null,
      source: 'sleep_start',
    });
  }
  if (actionType === 'create_calendar_event') {
    return normalizeSubject({
      ...common,
      type: 'calendar_event',
      label: data?.title || args?.title || 'Calendar event',
      date: data?.event_date || args?.event_date || args?.date || null,
      start_time: data?.start_time || args?.start_time || null,
      end_time: data?.end_time || args?.end_time || null,
      source: 'calendar_event',
    });
  }
  if (actionType === 'create_memo') {
    return normalizeSubject({
      ...common,
      type: 'memo',
      label: data?.title || args?.title || 'Memo',
      date: data?.memo_date || args?.memo_date || args?.date || null,
      start_time: data?.memo_time || args?.memo_time || args?.time || null,
      source: 'memo',
    });
  }
  if (['update_memo_status', 'snooze_memo', 'dismiss_memo'].includes(actionType)) {
    return normalizeSubject({
      ...common,
      type: 'memo',
      label: data?.title || args?.title || 'Memo',
      date: data?.memo_date || args?.memo_date || null,
      start_time: data?.memo_time || args?.memo_time || null,
      source: 'memo',
    });
  }
  if (actionType === 'create_expense') {
    return normalizeSubject({
      ...common,
      type: 'expense',
      label: data?.vendor || args?.vendor || data?.category || 'Expense',
      date: data?.spent_on || args?.spent_on || args?.date || null,
      amount: data?.amount ?? args?.amount ?? null,
      currency: data?.currency || args?.currency || null,
      source: 'expense',
    });
  }
  return normalizeSubject({
    ...common,
    type: 'generic',
    label: message ? String(message).slice(0, 80) : 'Recent item',
    source: 'assistant_answer',
  });
}

export function buildSubjectFromPendingAction(pendingAction) {
  if (!pendingAction || typeof pendingAction !== 'object') return null;
  const args = pendingAction.args && typeof pendingAction.args === 'object' ? pendingAction.args : {};
  if (pendingAction.action_type === 'update_health_log') {
    return normalizeSubject({
      id: pendingAction.id,
      type: 'health_event',
      label: inferHealthLabel(args, {}, pendingAction.language),
      date: args.logged_on || args.date || null,
      start_time: args.nap_start_time || args.start_time || null,
      end_time: args.nap_end_time || args.end_time || null,
      source: 'pending_action',
      source_action_id: pendingAction.id,
      confidence: pendingAction.confidence ?? 0.8,
      raw: compactRaw(args),
    });
  }
  if (pendingAction.action_type === 'log_sleep_start') {
    return normalizeSubject({
      id: pendingAction.id,
      type: 'health_event',
      label: pendingAction.language === 'it' ? 'Inizio sonno' : 'Sleep start',
      date: args.logged_on || args.date || null,
      start_time: args.time || args.sleep_start || null,
      source: 'pending_action',
      source_action_id: pendingAction.id,
      confidence: pendingAction.confidence ?? 0.8,
      raw: compactRaw(args),
    });
  }
  if (pendingAction.action_type === 'create_calendar_event') {
    return normalizeSubject({
      id: pendingAction.id,
      type: 'calendar_event',
      label: args.title || pendingAction.summary || 'Calendar event',
      date: args.event_date || args.date || null,
      start_time: args.start_time || null,
      end_time: args.end_time || null,
      source: 'pending_action',
      source_action_id: pendingAction.id,
      confidence: pendingAction.confidence ?? 0.8,
      raw: compactRaw(args),
    });
  }
  if (pendingAction.action_type === 'create_memo') {
    return normalizeSubject({
      id: pendingAction.id,
      type: 'memo',
      label: args.title || pendingAction.summary || 'Memo',
      date: args.memo_date || args.date || null,
      start_time: args.memo_time || args.time || null,
      source: 'pending_action',
      source_action_id: pendingAction.id,
      confidence: pendingAction.confidence ?? 0.8,
      raw: compactRaw(args),
    });
  }
  return null;
}

export function resolveSimpleReferent({ message, workingContext } = {}) {
  const text = normalizeText(message);
  if (!text) return { resolved: false, reason: 'No message.' };
  const referential = /\b(?:it|this|that|same|also|lo|la|questo|questa|quello|quella|stesso|stessa|anche|li|lì|orario|tempo)\b/.test(text);
  if (!referential) return { resolved: false, reason: 'No obvious referential wording.' };
  const subject = normalizeSubject(workingContext?.last_subject);
  if (!subject) return { resolved: false, reason: 'No last subject.' };
  return {
    resolved: true,
    source: 'last_subject',
    subject,
    confidence: subject.confidence ?? 0.85,
  };
}

export function formatReferentClarification({ message, workingContext, language } = {}) {
  const selectedLanguage = language === 'it' || workingContext?.language === 'it' ? 'it' : 'en';
  const referents = (workingContext?.referents ?? []).filter(Boolean).slice(0, 3);
  if (referents.length > 1) {
    const labels = referents.map((item) => item.label).filter(Boolean).join(' o ');
    return selectedLanguage === 'it'
      ? `Intendi ${labels || 'uno degli elementi recenti'}?`
      : `Do you mean ${labels || 'one of the recent items'}?`;
  }
  return selectedLanguage === 'it'
    ? 'Che cosa vuoi usare o aggiungere?'
    : 'What do you want me to use or add?';
}

function normalizeSubject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const type = SUBJECT_TYPES.has(value.type) ? value.type : 'generic';
  const label = cleanText(value.label, 160);
  if (!label && !value.date && !value.start_time && !value.amount) return null;
  return {
    id: cleanText(value.id, 120),
    type,
    label: label || type,
    date: cleanText(value.date, 40),
    start_time: cleanText(value.start_time, 20),
    end_time: cleanText(value.end_time, 20),
    amount: value.amount ?? null,
    currency: cleanText(value.currency, 20),
    source: cleanText(value.source, 80) || 'assistant_answer',
    source_message_id: cleanText(value.source_message_id, 120),
    source_action_id: cleanText(value.source_action_id, 120),
    created_by_last_action: Boolean(value.created_by_last_action),
    confidence: clampNumber(value.confidence, 0, 1, 0.7),
    raw: compactRaw(value.raw),
  };
}

function normalizeActionResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const actionType = cleanText(value.action_type || value.type, 80);
  if (!actionType) return null;
  return {
    action_type: actionType,
    status: cleanText(value.status, 40) || 'success',
    summary: cleanText(value.summary, 300),
    args: compactRaw(value.args),
    result: compactRaw(value.result),
    created_at: cleanText(value.created_at, 80),
  };
}

function compactSubject(subject) {
  const normalized = normalizeSubject(subject);
  if (!normalized) return null;
  return {
    key: subject?.key,
    type: normalized.type,
    label: normalized.label,
    date: normalized.date,
    start_time: normalized.start_time,
    end_time: normalized.end_time,
    amount: normalized.amount,
    source: normalized.source,
    confidence: normalized.confidence,
  };
}

function dedupeSubjects(subjects) {
  const seen = new Set();
  const result = [];
  for (const subject of subjects) {
    const normalized = normalizeSubject(subject);
    if (!normalized) continue;
    const key = [normalized.type, normalized.label, normalized.date, normalized.start_time, normalized.end_time].filter(Boolean).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(subject);
  }
  return result;
}

function inferHealthLabel(args = {}, result = {}, language = 'en') {
  const note = String(args?.health_note_append || result?.notes || args?.notes || '').trim();
  if (/pisolino|nap/i.test(note)) return language === 'it' ? 'Pisolino' : 'Nap';
  if (args?.wake_time) return 'Wake Time';
  if (args?.sleep_start) return 'Sleep Start';
  return language === 'it' ? 'Salute' : 'Health';
}

function detectLanguage(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const italianMatches = text.match(/\b(?:oggi|domani|pisolino|sveglia|pranzo|cena|salute|calendario|promemoria|ricordami|aggiungilo|mettilo|stesso|orario|fatto|si|non|che|ho|hai|gia|usato)\b/g) ?? [];
  const englishMatches = text.match(/\b(?:today|tomorrow|nap|wake|lunch|dinner|health|calendar|reminder|same|time|add|put|yes|don't|what|use)\b/g) ?? [];
  if (italianMatches.length > englishMatches.length) return 'it';
  if (englishMatches.length > italianMatches.length) return 'en';
  return null;
}

function compactRaw(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => {
    if (item && typeof item === 'object') return [key, '[object]'];
    return [key, typeof item === 'string' ? item.slice(0, 300) : item];
  }));
}

function cleanText(value, max = 1000) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
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
