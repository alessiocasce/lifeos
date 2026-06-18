import { generateGeminiJson } from './gemini.js';
import { localDate, localTime } from './date.js';
import {
  canSkillPerformIntent,
  getBrainSkill,
  listBrainSkills,
  selectBrainSkill,
} from './brainSkills.js';

const ROUTE_MODES = new Set([
  'casual_chat',
  'memory_write',
  'memory_recall',
  'memory_forget',
  'read_only_analysis',
  'explicit_action',
  'follow_up_transform',
  'clarification',
]);

const RISK_LEVELS = new Set(['none', 'low', 'medium', 'high']);
const MEMORY_CATEGORIES = new Set(['identity', 'preference', 'goal', 'constraint', 'project', 'behavior', 'ui_preference', 'health', 'workout', 'productivity', 'business', 'other']);
const DATASETS = new Set([
  'expenses',
  'health_logs',
  'workouts',
  'workout_sets',
  'calendar_events',
  'daily_reviews',
  'memos',
  'projects',
  'project_sessions',
  'project_money_entries',
  'ai_memories',
  'ai_insights',
]);
const ACTION_TYPES = new Set([
  'create_expense',
  'create_calendar_event',
  'create_calendar_events',
  'finite_recurring_calendar_events',
  'create_memo',
  'update_health_log',
  'log_sleep_start',
  'analyze_and_plan',
  'memory_update',
]);
const WRITE_MODES = new Set(['explicit_action']);
const READ_ONLY_MODES = new Set(['casual_chat', 'read_only_analysis', 'memory_recall', 'memory_forget', 'follow_up_transform', 'clarification']);

const BRAIN_ROUTER_SYSTEM = `
You are the LifeOS Brain semantic router.
You are not answering the user.
Return strict JSON only. No markdown. No commentary.

Schema:
{
  "mode": "casual_chat" | "memory_write" | "memory_recall" | "memory_forget" | "read_only_analysis" | "explicit_action" | "follow_up_transform" | "clarification",
  "primary_skill": "general_chat",
  "secondary_skills": [],
  "confidence": 0.0,
  "reason": "short explanation",
  "user_intent_summary": "what the user means",
  "needs_data": [],
  "write_intent": false,
  "proposed_action_types": [],
  "risk_level": "none" | "low" | "medium" | "high",
  "needs_clarification": false,
  "clarification_question": null,
  "follow_up_reference": "latest_assistant_answer" | "conversation" | null,
  "memory_candidate": null
}

Memory candidate shape when mode is memory_write:
{
  "category": "identity" | "preference" | "goal" | "constraint" | "project" | "behavior" | "ui_preference" | "other",
  "title": "Preferred Name",
  "content": "User's preferred name is Ale.",
  "importance": 5,
  "confidence": 0.98
}

Rules:
- Understand the user's meaning semantically.
- Do not answer the user.
- Do not invent actions.
- The current user message is the only source of write intent.
- Conversation history can provide reference/context and can support a clarification confirmation, but not permission to write by itself.
- If recent assistant metadata contains a pending_action and the user confirms, cancels, or supplies missing slots, backend pending-action resolution handles it before normal planning.
- Do not repeat a generic clarification when a stored pending_action already contains the relevant title, date, time, or other slots.
- If the user says "don't schedule", "do not create", "no memo", "non creare", "non mettere in calendario", or similar, write_intent must be false.
- Tentative language like "might", "maybe", "forse", "magari", or "potrei" is not write intent.
- Ambiguous fragments like "gym tomorrow 5", "tomorrow pill 8:30", "study friday 4", or "palestra domani 5" should be clarification, not casual_chat and not silent write.
- Phrases such as "blocca", "fissa", "pianifica", "programma", "metti in calendario", "segnami in calendario", "block", "schedule", and "put in calendar" can indicate calendar/time-block intent.
- Vague timing phrases such as "dopo pranzo", "dopo cena", "in mattinata", "mattina", "pomeriggio", "sera", "stasera", "piu tardi", "after lunch", "after dinner", "morning", "afternoon", "evening", and "later" are not exact start/end times.
- If calendar intent is clear but timing is vague, return mode "clarification", primary_skill "calendar_planner", write_intent false, and ask for the exact start/end time. Do not classify it as casual_chat.
- "remember my name is Ale", "call me Ale", and "remember I hate noisy dashboards" are memory_write.
- "remember to buy toothpaste" is explicit_action with memo_assistant, not long-term memory.
- "what do you remember about me?" is memory_recall.
- "forget the memory about noisy dashboards" is memory_forget.
- Follow-up transforms like "make it shorter", "fammi una tabella", "mettile in ordine cronologico", or "translate it to English" are follow_up_transform.
- Product critique like "Be brutally honest: is LifeOS becoming too complicated?" is read_only_analysis with product_builder.
- Casual app-open messages like "yo, I just opened LifeOS" are casual_chat with general_chat, not product_builder.
- Workout advice/performance questions are read_only_analysis with workout_coach unless the current message explicitly asks to schedule/create/add to calendar.
- Calendar writes require explicit current-message schedule/calendar/day-planning intent.
- Memo writes require explicit reminder/task intent.
- Health writes require explicit log/update intent.
- Going-to-sleep / bedtime / sleep start commands with a time are Health writes and should propose log_sleep_start.
- Expense writes require explicit expense log intent.
- Broad "how am I doing?" requests are read_only_analysis with life_review.
- If previous assistant asked a specific clarification and the user confirms with enough details, mode may be explicit_action.
`;

export async function routeBrainMessageWithAI({
  message,
  brainChat,
  brainContext,
  classification,
  source = 'app',
} = {}) {
  const fallback = fallbackBrainRoute({ message, classification, brainChat, reason: 'AI router fallback prepared.' });
  const prompt = JSON.stringify({
    today: localDate(),
    currentTime: localTime(),
    source,
    userMessage: message,
    deterministicHint: classification ?? null,
    recentConversation: compactConversation(brainChat),
    userMemoryContext: compactBrainContext(brainContext),
    availableSkills: compactSkills(),
  });
  const route = await generateGeminiJson({
    system: BRAIN_ROUTER_SYSTEM,
    prompt,
    temperature: 0,
    invalidMessage: 'Gemini returned an invalid Brain route.',
    repair: true,
  });
  return validateBrainRoute(route, { message, classification, brainChat, fallbackRoute: fallback });
}

export function validateBrainRoute(route, {
  message = '',
  classification = null,
  brainChat = null,
  fallbackRoute = null,
} = {}) {
  const fallback = fallbackRoute ?? fallbackBrainRoute({ message, classification, brainChat });
  if (!route || typeof route !== 'object' || Array.isArray(route)) return fallback;

  const mode = ROUTE_MODES.has(route.mode) ? route.mode : fallback.mode;
  let primarySkill = getBrainSkill(route.primary_skill)?.id === route.primary_skill
    ? route.primary_skill
    : fallback.primary_skill;
  const secondarySkills = Array.isArray(route.secondary_skills)
    ? route.secondary_skills.filter((id) => getBrainSkill(id)?.id === id && id !== primarySkill).slice(0, 3)
    : [];
  const confidence = clampNumber(route.confidence, 0, 1, fallback.confidence ?? 0.45);
  const proposedActionTypes = normalizeActionTypes(route.proposed_action_types);
  const riskLevel = RISK_LEVELS.has(route.risk_level) ? route.risk_level : 'low';
  const negative = hasNegativeWriteIntent(message);
  const destructive = hasDestructiveActionRequest(message) || proposedActionTypes.some((type) => type.startsWith('delete') || type.startsWith('archive'));
  const vagueCalendarBlock = looksLikeVagueCalendarBlockRequest(message);
  let writeIntent = Boolean(route.write_intent);
  let finalMode = mode;
  let finalRisk = destructive ? 'high' : riskLevel;

  if (negative || destructive || mode === 'follow_up_transform' || READ_ONLY_MODES.has(mode)) {
    writeIntent = false;
  }
  if (mode === 'memory_write') {
    writeIntent = false;
  }
  if (writeIntent && !WRITE_MODES.has(mode)) {
    finalMode = 'clarification';
    writeIntent = false;
  }
  if (finalRisk === 'high') {
    writeIntent = false;
  }
  if (vagueCalendarBlock) {
    finalMode = 'clarification';
    primarySkill = 'calendar_planner';
    writeIntent = false;
    finalRisk = destructive ? 'high' : 'low';
  }

  const needsClarification = Boolean(route.needs_clarification) || finalMode === 'clarification';
  const needsData = normalizeNeedsData(route.needs_data, primarySkill, finalMode);
  const clarificationQuestion = vagueCalendarBlock
    ? specificCalendarClarification(message)
    : cleanText(route.clarification_question, 300)
    ?? fallback.clarification_question
    ?? null;
  const memoryCandidate = finalMode === 'memory_write' ? normalizeMemoryCandidate(route.memory_candidate) : null;

  return {
    mode: finalMode,
    primary_skill: primarySkill,
    secondary_skills: secondarySkills,
    confidence,
    reason: cleanText(route.reason, 300) || fallback.reason || 'AI semantic route.',
    user_intent_summary: cleanText(route.user_intent_summary, 500) || fallback.user_intent_summary || '',
    needs_data: needsData,
    write_intent: writeIntent,
    proposed_action_types: writeIntent ? proposedActionTypes : [],
    risk_level: finalRisk,
    needs_clarification: needsClarification,
    clarification_question: needsClarification ? clarificationQuestion : null,
    follow_up_reference: route.follow_up_reference === 'latest_assistant_answer' || route.follow_up_reference === 'conversation'
      ? route.follow_up_reference
      : null,
    memory_candidate: memoryCandidate,
    source: 'ai_router',
    deterministic_override: negative || destructive || finalMode !== mode ? {
      negative_write_intent: negative,
      destructive_request: destructive,
      original_mode: mode,
    } : null,
  };
}

export function fallbackBrainRoute({ message = '', classification = null, brainChat = null, reason = 'Deterministic fallback route.' } = {}) {
  const selected = selectBrainSkill({ message, classification });
  let mode = mapClassificationToRouteMode(classification?.kind);
  let primarySkill = selected.skill.id;
  let writeIntent = mode === 'explicit_action';
  let needsClarification = mode === 'clarification';
  let clarificationQuestion = null;

  if (looksLikeVagueCalendarBlockRequest(message)) {
    mode = 'clarification';
    primarySkill = 'calendar_planner';
    writeIntent = false;
    needsClarification = true;
    clarificationQuestion = specificCalendarClarification(message);
  }

  if (!needsClarification && looksLikeAmbiguousFragment(message)) {
    mode = 'clarification';
    primarySkill = looksLikeReminderFragment(message) ? 'memo_assistant' : 'calendar_planner';
    writeIntent = false;
    needsClarification = true;
    clarificationQuestion = looksLikeReminderFragment(message)
      ? 'Do you want me to create a reminder? If yes, what exact date and AM/PM time should I use?'
      : 'Do you want me to schedule this? If yes, what exact start and end time should I use?';
  }

  if (hasNegativeWriteIntent(message)) {
    writeIntent = false;
    if (mode === 'casual_chat') primarySkill = 'general_chat';
  }

  return {
    mode,
    primary_skill: primarySkill,
    secondary_skills: [],
    confidence: selected.confidence ?? 0.45,
    reason,
    user_intent_summary: String(message ?? '').trim().slice(0, 500),
    needs_data: normalizeNeedsData([], primarySkill, mode),
    write_intent: writeIntent,
    proposed_action_types: writeIntent ? inferFallbackActions(message, primarySkill) : [],
    risk_level: hasDestructiveActionRequest(message) ? 'high' : 'low',
    needs_clarification: needsClarification,
    clarification_question: clarificationQuestion,
    follow_up_reference: mode === 'follow_up_transform' && hasPreviousAssistant(brainChat) ? 'latest_assistant_answer' : null,
    memory_candidate: null,
    source: 'deterministic_fallback',
  };
}

export function formatBrainRouteForPrompt(route) {
  if (!route) return 'Brain Route: unavailable.';
  return [
    'Brain Route:',
    `- Mode: ${route.mode}`,
    `- Primary skill: ${route.primary_skill}`,
    `- Confidence: ${Number(route.confidence ?? 0).toFixed(2)}`,
    `- Intent summary: ${route.user_intent_summary || 'none'}`,
    `- Needs data: ${route.needs_data?.length ? route.needs_data.join(', ') : 'none'}`,
    `- Write intent: ${route.write_intent ? 'true' : 'false'}`,
    `- Proposed actions: ${route.proposed_action_types?.length ? route.proposed_action_types.join(', ') : 'none'}`,
    `- Risk level: ${route.risk_level || 'none'}`,
    `- Needs clarification: ${route.needs_clarification ? 'true' : 'false'}`,
    route.clarification_question ? `- Clarification question: ${route.clarification_question}` : null,
    `- Reason: ${route.reason || 'none'}`,
  ].filter(Boolean).join('\n');
}

export function canExecuteBrainAction({ route, skill, plan, message }) {
  const intent = String(plan?.intent ?? '').trim();
  if (!intent || !plan?.needsWrite) return { allowed: true, reason: 'No write requested.' };
  if (hasNegativeWriteIntent(message)) return { allowed: false, reason: 'Negative write intent blocks writes.' };
  if (hasDestructiveActionRequest(message) || intent === 'blocked_destructive' || plan?.riskLevel === 'high') {
    return { allowed: false, reason: 'Destructive/high-risk actions are blocked.' };
  }
  if (!route?.write_intent || route.mode !== 'explicit_action') {
    return { allowed: false, reason: 'Brain route did not confirm explicit current write intent.' };
  }
  if (hasTentativeWriteLanguage(message) && !hasExplicitWriteVerb(message)) {
    return { allowed: false, reason: 'Tentative language is not enough to write.' };
  }
  if (Array.isArray(route.proposed_action_types) && route.proposed_action_types.length && !route.proposed_action_types.includes(intent)) {
    const compatibleCalendarBatch = intent === 'create_calendar_events'
      && (route.proposed_action_types.includes('finite_recurring_calendar_events') || route.proposed_action_types.includes('create_calendar_event'));
    const compatibleCalendarSingle = intent === 'create_calendar_event' && route.proposed_action_types.includes('create_calendar_events');
    const compatibleSleepStart = intent === 'log_sleep_start' && route.proposed_action_types.includes('update_health_log');
    if (!compatibleCalendarBatch && !compatibleCalendarSingle && !compatibleSleepStart) {
      return { allowed: false, reason: `Planner intent ${intent} was not proposed by the semantic route.` };
    }
  }
  return canSkillPerformIntent(skill, plan, message);
}

export function serializeBrainRoute(route) {
  if (!route) return null;
  return {
    mode: route.mode,
    primary_skill: route.primary_skill,
    confidence: Number(route.confidence ?? 0),
    reason: route.reason || '',
    needs_data: Array.isArray(route.needs_data) ? route.needs_data.slice(0, 12) : [],
    write_intent: Boolean(route.write_intent),
    risk_level: route.risk_level || 'none',
  };
}

function compactSkills() {
  return listBrainSkills().map((skill) => ({
    id: skill.id,
    label: skill.label,
    whenToUse: skill.whenToUse,
    allowedActions: skill.allowedActions,
    forbiddenActions: skill.forbiddenActions,
  }));
}

function compactBrainContext(brainContext) {
  const memories = Array.isArray(brainContext?.memories) ? brainContext.memories : [];
  const insights = Array.isArray(brainContext?.insights) ? brainContext.insights : [];
  return {
    memories: memories.slice(0, 20).map((memory) => ({
      category: memory.category,
      title: memory.title,
      content: memory.content,
      importance: memory.importance,
    })),
    insights: insights.slice(0, 6).map((insight) => ({
      type: insight.insight_type,
      title: insight.title,
      content: insight.content,
    })),
  };
}

function compactConversation(brainChat) {
  const history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  return history.slice(-8).map((message) => ({
    role: message.role,
    content: cleanText(message.content, 900),
    created_at: message.created_at,
  }));
}

function normalizeNeedsData(value, primarySkill, mode) {
  const explicit = Array.isArray(value) ? value.filter((item) => DATASETS.has(item)) : [];
  if (explicit.length) return Array.from(new Set(explicit)).slice(0, 12);
  if (mode === 'casual_chat' || mode === 'clarification' || mode === 'follow_up_transform') return [];
  return (getBrainSkill(primarySkill).dataTables ?? []).filter((item) => DATASETS.has(item)).slice(0, 12);
}

function normalizeActionTypes(value) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item) => ACTION_TYPES.has(item)))).slice(0, 8)
    : [];
}

function normalizeMemoryCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const title = cleanText(candidate.title, 100);
  const content = cleanText(candidate.content, 500);
  if (!title || !content || containsSecretLikeText(content)) return null;
  return {
    category: MEMORY_CATEGORIES.has(candidate.category) ? candidate.category : 'other',
    title,
    content,
    source: 'user_explicit',
    confidence: clampNumber(candidate.confidence, 0, 1, 0.9),
    importance: Math.round(clampNumber(candidate.importance, 1, 5, 3)),
  };
}

function mapClassificationToRouteMode(kind) {
  if (kind === 'memory_write') return 'memory_write';
  if (kind === 'memory_recall') return 'memory_recall';
  if (kind === 'memory_forget') return 'memory_forget';
  if (kind === 'follow_up_transform') return 'follow_up_transform';
  if (kind === 'read_only_analysis') return 'read_only_analysis';
  if (kind === 'explicit_action') return 'explicit_action';
  if (kind === 'clarify') return 'clarification';
  return 'casual_chat';
}

function inferFallbackActions(message, primarySkill) {
  const text = normalizeText(message);
  if (/\b(?:sleep start|bedtime|going to sleep|vado a dormire|sto andando a dormire|andando a letto|inizio sonno)\b/.test(text)) return ['log_sleep_start'];
  if (primarySkill === 'memo_assistant') return ['create_memo'];
  if (primarySkill === 'calendar_planner') return ['create_calendar_event'];
  if (primarySkill === 'health_coach') return ['update_health_log'];
  if (primarySkill === 'finance_analyst') return ['create_expense'];
  if (/\b(?:expense|euro|eur|dollar|\$)\b/.test(text)) return ['create_expense'];
  if (/\b(?:remind me|remember to|ricordami)\b/.test(text)) return ['create_memo'];
  if (/\b(?:schedule|calendar|programma|calendario)\b/.test(text)) return ['create_calendar_event'];
  return [];
}

export function looksLikeVagueCalendarBlockRequest(message) {
  const text = normalizeText(message);
  if (!text || hasNegativeWriteIntent(text)) return false;
  const hasVagueTime = hasVagueCalendarTimePhrase(text);
  if (!hasVagueTime) return false;
  const hasDateish = /\b(?:today|tomorrow|tonight|friday|monday|tuesday|wednesday|thursday|saturday|sunday|next week|oggi|domani|stasera|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|settimana prossima)\b/.test(text);
  const hasActionVerb = /\b(?:block|schedule|plan|add|create|put|blocca|fissa|pianifica|programma|metti|mettimelo|mettilo|segnami|segnamelo)\b/.test(text);
  const hasCalendarDomain = /\b(?:calendar|calendario|event|evento|time block|blocco|palestra|gym|studio|study|dentist|dentista|doctor|vault|progetto|project|work|lavoro|call|chiamata)\b/.test(text);
  const hasRelativeLater = /\b(?:later|piu tardi|stasera)\b/.test(text);
  return hasVagueTime && (hasDateish || hasRelativeLater) && (hasActionVerb || hasCalendarDomain);
}

export function specificCalendarClarification(message) {
  const text = normalizeText(message);
  const italian = isProbablyItalianCalendarText(text);
  const phrase = extractVagueCalendarTimePhrase(text);
  const phraseText = phrase ? `"${phrase}"` : (italian ? 'quel momento' : 'that time');
  if (italian) {
    if (/\bdopo pranzo\b/.test(text)) {
      return `Certo - posso bloccarlo, ma ${phraseText} e' vago. Che orario esatto vuoi usare? Per esempio 14:30-15:30.`;
    }
    if (/\bpalestra\b/.test(text)) {
      return 'Vuoi che la metta in calendario? Se si, che orario esatto e durata devo usare?';
    }
    if (/\bstudio\b/.test(text)) {
      return `Vuoi bloccare lo studio? ${phraseText} e' vago: che orario esatto vuoi usare?`;
    }
    if (/\bdentista\b/.test(text)) {
      return 'Vuoi creare un evento per il dentista? Che orario esatto devo usare?';
    }
    return `Posso metterlo in calendario, ma ${phraseText} e' vago. Che orario esatto e durata devo usare?`;
  }
  if (/\bafter lunch\b/.test(text)) {
    return `I can block it, but ${phraseText} is vague. What exact time should I use? For example 14:30-15:30.`;
  }
  return `Do you want me to put this on the calendar? If yes, what exact start time, end time, and duration should I use?`;
}

function hasVagueCalendarTimePhrase(text) {
  return /\b(?:dopo pranzo|dopo cena|in mattinata|mattina|pomeriggio|sera|stasera|piu tardi|presto|after lunch|after dinner|morning|afternoon|evening|tonight|later|early)\b/.test(text);
}

function extractVagueCalendarTimePhrase(text) {
  const phrases = [
    'dopo pranzo',
    'dopo cena',
    'in mattinata',
    'mattina',
    'pomeriggio',
    'stasera',
    'sera',
    'piu tardi',
    'presto',
    'after lunch',
    'after dinner',
    'morning',
    'afternoon',
    'evening',
    'tonight',
    'later',
    'early',
  ];
  return phrases.find((phrase) => text.includes(phrase)) ?? null;
}

function isProbablyItalianCalendarText(text) {
  return /\b(?:blocca|fissa|pianifica|programma|metti|mettimelo|mettilo|segnami|segnamelo|domani|oggi|stasera|dopo|pranzo|cena|mattina|pomeriggio|sera|palestra|studio|dentista|calendario|un'ora|ore)\b/.test(text);
}

function looksLikeAmbiguousFragment(message) {
  const text = normalizeText(message);
  if (!text || text.length > 80 || hasExplicitWriteVerb(text)) return false;
  const hasDateish = /\b(?:today|tomorrow|friday|monday|tuesday|wednesday|thursday|saturday|sunday|oggi|domani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/.test(text);
  const hasTimeish = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/.test(text);
  const hasDomain = /\b(?:gym|palestra|pill|study|studio|doctor|dentist|school|workout|medicine|medicina)\b/.test(text);
  return hasDateish && hasTimeish && hasDomain;
}

function looksLikeReminderFragment(message) {
  return /\b(?:pill|medicine|medicina|antibiotic|antibiotico|reminder|memo)\b/.test(normalizeText(message));
}

function hasPreviousAssistant(brainChat) {
  return (Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : []).some((message) => message.role === 'assistant' && String(message.content ?? '').trim());
}

function hasNegativeWriteIntent(message) {
  const text = normalizeText(message);
  return /\b(?:don'?t|do\s+not|dont)\s+(?:schedule|create|log|add|make|put|set)\b/.test(text)
    || /\bno\s+(?:memo|event|calendar|reminder)\b/.test(text)
    || /\bdon'?t\s+(?:make|schedule|create)\s+a\s+memo\b/.test(text)
    || /\bdon'?t\s+put\s+(?:this|it)?\s*(?:in|on)\s+(?:the\s+)?calendar\b/.test(text)
    || /\bdon'?t\s+add\s+(?:this|it)\b/.test(text)
    || /\bnon\s+(?:farlo|programmare|segnare|segnarlo|salvare|salvarlo|creare|crearlo|loggare|bloccare|bloccarlo|fare\s+(?:un\s+)?memo|mettere\s+(?:in|nel)\s+calendario)\b/.test(text);
}

function hasDestructiveActionRequest(message) {
  return /\b(?:delete|remove|wipe|erase|destroy|archive all|elimina|cancella|rimuovi|archivia tutto)\b/.test(normalizeText(message));
}

function hasTentativeWriteLanguage(message) {
  return /\b(?:might|maybe|i think i might|i could|forse|magari|potrei|potrei aver bisogno)\b/.test(normalizeText(message));
}

function hasExplicitWriteVerb(message) {
  return /\b(?:create|add|log|schedule|remind me|set|put .*calendar|block|segna|aggiungi|crea|programma|programmamelo|logga|ricordami|segnalo|metti .*calendario)\b/.test(normalizeText(message));
}

function cleanText(value, max = 1000) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
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

function containsSecretLikeText(value) {
  return /\b(password|passcode|api key|secret key|bearer token|access token|service role|private key)\b/i.test(String(value ?? ''));
}
