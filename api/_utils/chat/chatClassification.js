import { canExecuteBrainAction, looksLikeVagueCalendarBlockRequest, specificCalendarClarification } from '../brainRouter.js';
import { extractExplicitMemoryCommand } from '../brain.js';
import { getBrainSkill, selectBrainSkill } from '../brainSkills.js';
import { getLatestAssistantMessage } from './chatScheduleParsing.js';
import {
  hasExplicitActionRequest,
  hasTentativeWriteLanguage,
  isCasualBrainMessage,
  isFollowUpTransformRequest,
  isMemoryForgetRequest,
  isMemoryRecallRequest,
  isReadOnlyAnalysisRequest,
  memoNeedsTimeClarification,
  normalizeBrainText,
} from './chatMemoryAnswers.js';

export function classifyBrainMessage(message, brainChat = null) {
  const text = String(message ?? '').trim();
  const normalized = normalizeBrainText(text);
  if (!normalized) return { kind: 'clarify', reason: 'Empty message.' };
  if (extractExplicitMemoryCommand(text)) return { kind: 'memory_write', reason: 'Explicit durable memory command.' };
  if (isMemoryRecallRequest(text)) return { kind: 'memory_recall', reason: 'Memory recall request.' };
  if (isMemoryForgetRequest(text)) return { kind: 'memory_forget', reason: 'Memory forget request.' };
  if (isFollowUpTransformRequest(text)) {
    if (getLatestAssistantMessage(brainChat)) return { kind: 'follow_up_transform', reason: 'Transform the previous assistant answer.' };
    return { kind: 'clarify', reason: 'Follow-up transform requested without previous assistant answer.' };
  }
  if (hasExplicitActionRequest(text)) return { kind: 'explicit_action', reason: 'Current message contains explicit supported write/action language.' };
  if (isReadOnlyAnalysisRequest(text)) return { kind: 'read_only_analysis', reason: 'Current message asks for analysis/advice/status without explicit write intent.' };
  if (hasTentativeWriteLanguage(text)) return { kind: 'casual', reason: 'Tentative language without explicit write intent.' };
  if (isCasualBrainMessage(text)) return { kind: 'casual', reason: 'Casual conversation without explicit read/write request.' };
  return { kind: 'casual', reason: 'Default chat-first behavior; no explicit read/write request.' };
}

export function hasNegativeWriteIntent(message) {
  const text = normalizeBrainText(message);
  return /\b(?:don'?t|do\s+not|dont)\s+(?:schedule|create|log|add|make|put|set)\b/.test(text)
    || /\bno\s+(?:memo|event|calendar|reminder)\b/.test(text)
    || /\bdon'?t\s+(?:make|schedule|create)\s+a\s+memo\b/.test(text)
    || /\bdon'?t\s+put\s+(?:this|it)?\s*(?:in|on)\s+(?:the\s+)?calendar\b/.test(text)
    || /\bdon'?t\s+add\s+(?:this|it)\b/.test(text)
    || /\bnon\s+(?:farlo|programmare|segnare|segnarlo|salvare|salvarlo|creare|crearlo|loggare|bloccare|bloccarlo|fare\s+(?:un\s+)?memo|mettere\s+(?:in|nel)\s+calendario)\b/.test(text);
}

export function enforceBrainWriteRestraint(message, plan = {}, classification, brainRoute = null, brainSkill = null) {
  const negative = hasNegativeWriteIntent(message);
  const routeWriteIntent = Boolean(brainRoute?.write_intent && brainRoute?.mode === 'explicit_action');
  const tentative = hasTentativeWriteLanguage(message) && !hasExplicitActionRequest(message) && !routeWriteIntent;
  const casualWrite = (classification.kind === 'casual' || brainRoute?.mode === 'casual_chat') && plan.needsWrite;
  if (negative || tentative || casualWrite) {
    const readOnly = classification.kind === 'read_only_analysis' || brainRoute?.mode === 'read_only_analysis' || plan.needsRead || plan.intent === 'analyze';
    return {
      ...plan,
      intent: readOnly ? 'analyze' : 'clarify',
      needsRead: Boolean(readOnly),
      needsWrite: false,
      args: {},
      clarifyingQuestion: getSafeClarificationQuestion({ message, plan, brainRoute, brainSkill, negative }),
      riskLevel: 'low',
      reason: negative
        ? 'Negative write intent in current message blocked all writes.'
        : 'Tentative/casual language without explicit current write request blocked planner write.',
    };
  }

  if (plan.needsWrite && plan.intent === 'create_memo' && memoNeedsTimeClarification(message, plan.args)) {
    return {
      ...plan,
      intent: 'clarify',
      needsRead: false,
      needsWrite: false,
      args: {},
      clarifyingQuestion: 'What time should I remind you? For example 15:00 or 3pm.',
      riskLevel: 'low',
      reason: 'Memo request used a vague part-of-day time, so Brain asked for clarification instead of attempting a write.',
    };
  }

  if (plan.needsWrite && !hasExplicitActionRequest(message) && !routeWriteIntent) {
    return {
      ...plan,
      intent: 'clarify',
      needsRead: false,
      needsWrite: false,
      args: {},
      clarifyingQuestion: getSafeClarificationQuestion({ message, plan, brainRoute, brainSkill }),
      riskLevel: 'low',
      reason: 'Planner requested a write without explicit current-message action language.',
    };
  }

  return plan;
}

export function enforceBrainSkillWritePermission(message, plan = {}, skillSelection, brainRoute = null) {
  const permission = canExecuteBrainAction({
    route: brainRoute,
    skill: skillSelection?.skill,
    plan,
    message,
  });
  if (permission.allowed) return plan;
  const readOnly = plan.needsRead || plan.intent === 'analyze_and_plan';
  return {
    ...plan,
    intent: readOnly ? 'analyze' : 'clarify',
    needsRead: Boolean(readOnly),
    needsWrite: false,
    args: {},
    clarifyingQuestion: readOnly
      ? null
      : getSafeClarificationQuestion({ message, plan, brainRoute, brainSkill: skillSelection }),
    riskLevel: 'low',
    reason: `${plan.reason || 'Planner requested a write.'} Skill guard blocked the write: ${permission.reason}`,
  };
}

export function getSafeClarificationQuestion({ message, plan = {}, brainRoute = null, brainSkill = null, negative = false } = {}) {
  if (negative || hasNegativeWriteIntent(message)) {
    return "Understood - I won't create anything. We can just talk it through.";
  }

  const skillId = brainSkill?.skill?.id || brainSkill?.id || brainRoute?.primary_skill || '';
  const routeQuestion = String(brainRoute?.clarification_question || plan?.clarifyingQuestion || '').trim();
  const genericRouteQuestion = /advice|create something|talk it through|what details should i use/i.test(routeQuestion);
  if (routeQuestion && !(genericRouteQuestion && (skillId === 'calendar_planner' || looksLikeVagueCalendarBlockRequest(message)))) {
    return routeQuestion;
  }

  if (skillId === 'calendar_planner' || looksLikeVagueCalendarBlockRequest(message) || plan.intent === 'create_calendar_event') {
    if (looksLikeVagueCalendarBlockRequest(message)) return specificCalendarClarification(message);
    return 'What exact start time, end time, and date should I use for the calendar event?';
  }
  if (skillId === 'memo_assistant' || plan.intent === 'create_memo') {
    return 'What reminder title, date, and exact time should I use?';
  }
  if (plan.intent === 'log_sleep_start') {
    return 'What sleep start time should I use?';
  }
  if (skillId === 'health_coach' || plan.intent === 'update_health_log') {
    return 'Do you want me to log this in Health? If yes, what date and time should I use?';
  }
  if (skillId === 'finance_analyst' || plan.intent === 'create_expense') {
    return 'What amount, vendor, category, and date should I use for the expense?';
  }
  return routeQuestion || 'What exact details should I use?';
}

export function mergeBrainRouteIntoPlan(plan = {}, brainRoute, skillSelection) {
  if (!brainRoute) return plan;
  const routeTables = routeDataToPlanTables(brainRoute.needs_data);
  const skillTables = routeDataToPlanTables(skillSelection?.skill?.dataTables ?? []);
  const mergedTables = Array.from(new Set([
    ...(Array.isArray(plan.tables) ? plan.tables : []),
    ...routeTables,
    ...(brainRoute.mode === 'read_only_analysis' ? skillTables : []),
  ]));
  const needsRouteRead = brainRoute.mode === 'read_only_analysis' || routeTables.length > 0;
  const routeBlocksWrite = !brainRoute.write_intent && plan.needsWrite;
  return {
    ...plan,
    needsRead: Boolean(plan.needsRead || needsRouteRead),
    needsWrite: routeBlocksWrite ? false : plan.needsWrite,
    intent: routeBlocksWrite ? (needsRouteRead ? 'analyze' : 'clarify') : plan.intent,
    tables: mergedTables,
    clarifyingQuestion: brainRoute.needs_clarification
      ? (brainRoute.clarification_question || plan.clarifyingQuestion)
      : plan.clarifyingQuestion,
    reason: [plan.reason, brainRoute.reason ? `Brain route: ${brainRoute.reason}` : null].filter(Boolean).join(' '),
  };
}

function routeDataToPlanTables(items = []) {
  const supported = new Set(['expenses', 'health_logs', 'workouts', 'workout_sets', 'calendar_events', 'daily_reviews', 'memos', 'projects', 'project_sessions', 'project_money_entries']);
  return (Array.isArray(items) ? items : []).filter((item) => supported.has(item));
}

export function serializeSkillSelection(selection) {
  if (!selection?.skill?.id) return null;
  return {
    id: selection.skill.id,
    label: selection.skill.label,
    badge: selection.skill.badge,
    confidence: Number(selection.confidence ?? 0),
    reason: selection.reason || '',
    matchedSignals: Array.isArray(selection.matchedSignals) ? selection.matchedSignals.slice(0, 12) : [],
  };
}

export function selectBrainSkillFromRoute(brainRoute, fallbackInput) {
  if (brainRoute?.primary_skill) {
    const skill = getBrainSkill(brainRoute.primary_skill);
    if (skill?.id === brainRoute.primary_skill) {
      return {
        skill,
        confidence: Number(brainRoute.confidence ?? 0),
        reason: brainRoute.reason || 'AI semantic router selected this skill.',
        matchedSignals: [brainRoute.mode, ...(Array.isArray(brainRoute.proposed_action_types) ? brainRoute.proposed_action_types : [])].filter(Boolean),
      };
    }
  }
  return selectBrainSkill(fallbackInput);
}

export function routeMemoryCommand(brainRoute) {
  const candidate = brainRoute?.memory_candidate;
  if (!candidate) return null;
  return {
    memory: {
      category: candidate.category,
      title: candidate.title,
      content: candidate.content,
      source: candidate.source ?? 'user_explicit',
      confidence: candidate.confidence,
      importance: candidate.importance,
    },
    response: `Got it - I'll remember: ${candidate.content}`,
  };
}

export function createClarificationBrainPlan(brainRoute) {
  return {
    intent: 'clarify',
    needsRead: false,
    needsWrite: false,
    range: null,
    tables: [],
    args: {},
    clarifyingQuestion: brainRoute?.clarification_question || 'What details should I use?',
    riskLevel: 'low',
    reason: brainRoute?.reason || 'Brain route requested clarification.',
  };
}

export function createReadOnlyBrainPlan(reason) {
  return {
    intent: 'analyze',
    needsRead: false,
    needsWrite: false,
    range: null,
    tables: [],
    args: {},
    clarifyingQuestion: null,
    riskLevel: 'low',
    reason,
  };
}
