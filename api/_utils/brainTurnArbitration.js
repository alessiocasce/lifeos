export function normalizeTurnText(value) {
  return String(value ?? '')
    .replace(/['\u2019]/g, "'")
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasExplicitContextReferent(message) {
  const text = normalizeTurnText(message);
  if (!text) return false;
  return /\b(?:it|this|that|same|previous|above|that one|the same|lo|la|li|le|questo|questa|quello|quella|stesso|stessa|uguale|anche|gia|prima|sopra|mettilo|aggiungilo|segnalo|salvalo|l'hai|hai messo|hai segnato|quel promemoria|quell'evento|quel memo)\b/.test(text);
}

export function looksLikeExplicitNewCommand(message) {
  const text = normalizeTurnText(message);
  if (!text) return false;
  if (/^(?:si|sii|ok|okay|yes|yep|certo|confermo|conferma|procedi|fallo|salvalo|registralo|do it|proceed|correct|esatto|giusto)$/.test(text)) {
    return false;
  }
  if (/^(?:no|annulla|cancella|cancel|stop|lascia stare|lascia perdere|come non detto|nevermind|never mind)\b/.test(text)) {
    return false;
  }
  const hasCommandVerb = /\b(?:segna|segnami|segnalo|crea|creami|ricordami|promemoria|memo|metti|mettimelo|fissa|blocca|pianifica|programma|aggiungi|salva|registra|registrami|logga|log|save|create|schedule|remind me|add)\b/.test(text);
  if (!hasCommandVerb) return false;
  const hasContent = text.split(/\s+/).filter(Boolean).length >= 3
    || /\b(?:domani|oggi|stasera|mattina|domattina|\d{1,2}(?::|\.)\d{2}|\d{1,2}\s*(?:am|pm)|\d{1,2}\/\d{1,2})\b/.test(text);
  return hasContent;
}

export function looksLikeAgendaQuery(message) {
  const text = normalizeTurnText(message);
  if (!text) return false;
  const asksAgenda = /\b(?:cosa|che cosa|what|qual[ei])\b/.test(text)
    && /\b(?:devo fare|fare|ho|impegni|agenda|programmi|tasks?|to do|todo|memos?|promemoria|calendario|calendar|schedule)\b/.test(text);
  const directAgenda = /\b(?:guardami|mostrami|dimmi|show|list|check)\b.*\b(?:impegni|agenda|calendario|calendar|memos?|promemoria|tasks?|to do|todo)\b/.test(text)
    || /\b(?:impegni|agenda|calendario|calendar|promemoria|memos?|tasks?|to do|todo)\b.*\b(?:domani|today|tomorrow|oggi|stasera|questa settimana)\b/.test(text);
  return asksAgenda || directAgenda;
}

export function looksLikeOperationalContextQuestion(message) {
  const text = normalizeTurnText(message);
  if (!text) return false;
  return /\b(?:quando|a che ora|per quando|when|what time)\b/.test(text)
    && /\b(?:l'hai|hai messo|hai segnato|hai creato|me l'hai|lo hai|memo|promemoria|reminder|ricordi|ricordarmelo|put it|set it|created it|logged it)\b/.test(text);
}

export function isTrueLongTermMemoryRecallRequest(message) {
  const text = normalizeTurnText(message);
  if (!text) return false;
  return /\b(?:cosa ti ricordi di me|che cosa ti ricordi di me|cosa sai di me|che memoria hai su di me|what do you remember about me|what do you know about me|what does lifeos know about me|what's in memory|show memory|show memories|my preferences|le mie preferenze)\b/.test(text);
}

export function getIntentContractOverride(message) {
  if (looksLikeAgendaQuery(message)) {
    return {
      mode: 'read_only_analysis',
      primary_skill: 'calendar_planner',
      needs_data: ['calendar_events', 'memos', 'projects', 'project_sessions'],
      write_intent: false,
      risk_level: 'low',
      reason: 'Deterministic route invariant: agenda/task questions must read LifeOS schedule data, not long-term memory.',
      label: 'agenda_query',
    };
  }
  if (looksLikeOperationalContextQuestion(message)) {
    return {
      mode: 'read_only_analysis',
      primary_skill: 'memo_assistant',
      needs_data: ['memos', 'calendar_events'],
      write_intent: false,
      risk_level: 'low',
      reason: 'Deterministic route invariant: operational follow-up should use recent action context, not long-term memory.',
      label: 'operational_context_query',
    };
  }
  return null;
}

export function shouldDeferProactivePriorityToPending({ message, pendingReplyIntent } = {}) {
  const intent = pendingReplyIntent?.intent ?? 'other';
  if (intent === 'cancel') {
    return {
      defer: true,
      reason: 'generic_cancel_targets_active_pending_action',
      pending_reply_intent: intent,
    };
  }
  if (intent === 'clarify') {
    return {
      defer: true,
      reason: 'clarification_targets_active_pending_action',
      pending_reply_intent: intent,
    };
  }
  if (intent === 'confirm' && !looksLikeExplicitNewCommand(message)) {
    return {
      defer: false,
      reason: 'short_confirm_can_target_latest_proactive_message',
      pending_reply_intent: intent,
    };
  }
  return { defer: false, reason: 'proactive_priority_allowed', pending_reply_intent: intent };
}

export function buildOperationalContextAnswer({ message, workingContext } = {}) {
  if (!looksLikeOperationalContextQuestion(message)) return null;
  const subject = workingContext?.last_subject;
  const result = workingContext?.last_action_result;
  if (!subject && !result) return null;
  const language = workingContext?.language === 'it' ? 'it' : 'en';
  const label = subject?.label || result?.title || result?.memo?.title || (language === 'it' ? "l'elemento" : 'the item');
  const date = subject?.date || result?.date || result?.memo_date || result?.event_date || result?.saved?.memo_date || result?.memo?.memo_date;
  const time = subject?.start_time || result?.time || result?.memo_time || result?.start_time || result?.saved?.memo_time || result?.memo?.memo_time;
  const createdAt = result?.created_at || result?.saved?.created_at || result?.memo?.created_at;
  const createdText = formatCreatedAt(createdAt, language);
  if (language === 'it') {
    if (date && time) {
      return `${capitalize(label)} e' segnato per ${formatItalianDate(date)} alle ${time}.${createdText ? ` ${createdText}` : ''}`;
    }
    if (date) {
      return `${capitalize(label)} e' segnato per ${formatItalianDate(date)}.${createdText ? ` ${createdText}` : ''}`;
    }
    if (time) {
      return `${capitalize(label)} e' segnato alle ${time}.${createdText ? ` ${createdText}` : ''}`;
    }
    return `L'ultimo elemento e' ${label}.${createdText ? ` ${createdText}` : ''}`;
  }
  if (date && time) return `${capitalize(label)} is set for ${date} at ${time}.${createdText ? ` ${createdText}` : ''}`;
  if (date) return `${capitalize(label)} is set for ${date}.${createdText ? ` ${createdText}` : ''}`;
  if (time) return `${capitalize(label)} is set for ${time}.${createdText ? ` ${createdText}` : ''}`;
  return `The latest item is ${label}.${createdText ? ` ${createdText}` : ''}`;
}

function formatItalianDate(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value ?? '').trim();
  return `${Number(match[3])}/${Number(match[2])}/${match[1]}`;
}

function formatCreatedAt(value, language) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return '';
  return language === 'it' ? "L'ho creato poco fa." : 'I created it recently.';
}

function capitalize(value) {
  const text = String(value ?? '').trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}
