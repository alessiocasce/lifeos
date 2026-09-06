import { isPotentialPendingSlotFill, normalizePendingReplyIntent } from './brainPendingActions.js';
import { selectProactiveReplyTarget, shouldPrioritizeProactiveReplyOverPending } from './brainProactiveReplies.js';
import {
  getIntentContractOverride,
  hasExplicitContextReferent,
  inferWriteDomainFromMessage,
  isTrueLongTermMemoryRecallRequest,
  looksLikeAgendaQuery,
  looksLikeExplicitNewCommand,
  looksLikeOperationalContextQuestion,
  normalizeTurnText,
} from './brainTurnArbitration.js';
import { safePreview, sanitizeTraceValue } from './brainTrace.js';

const CONTRACT_SOURCES = {
  CURRENT: 'current_message',
  PENDING: 'pending_action',
  PROACTIVE: 'proactive_message',
  WORKING: 'working_context',
  MEMORY: 'memory',
  VAULT: 'vault',
};

export function buildBrainTurnContract({
  message = '',
  source = 'app',
  brainChat = null,
  workingContext = null,
  pendingAction = null,
  pendingReplyIntent = null,
  classification = null,
  route = null,
  now = new Date(),
} = {}) {
  const normalized = normalizeTurnText(message);
  const routeOverride = getIntentContractOverride(message);
  const explicitCommand = looksLikeExplicitNewCommand(message);
  const referential = hasExplicitContextReferent(message);
  const writeDomain = inferWriteDomainFromMessage(message);
  const pendingIntent = pendingAction
    ? (pendingReplyIntent ?? normalizePendingReplyIntent(message))
    : null;
  const proactiveSelection = source === 'whatsapp'
    ? selectProactiveReplyTarget({ message, brainChat, now })
    : { type: 'none', intent: { intent: 'other' } };
  const proactiveIntent = proactiveSelection?.intent?.intent ?? 'other';
  const fieldPolicy = buildFieldPolicy({ message, referential, explicitCommand });
  const base = {
    winning_path: 'unknown',
    intent_type: 'unknown',
    source_of_write_intent: 'none',
    allowed_context_sources: [CONTRACT_SOURCES.CURRENT],
    disallowed_steals: [],
    field_policy: fieldPolicy,
    route_override: routeOverride ? {
      mode: routeOverride.mode,
      primary_skill: routeOverride.primary_skill,
      needs_data: routeOverride.needs_data,
      reason: routeOverride.reason,
      label: routeOverride.label,
    } : null,
    write_domain: writeDomain,
    confidence: 0.45,
    reasons: [],
    trace: {
      text_preview: safePreview(message, 120),
      source,
      pending_reply_intent: pendingIntent?.intent ?? null,
      proactive_reply_intent: proactiveIntent,
      proactive_selection_type: proactiveSelection?.type ?? null,
      explicit_referent: referential,
      explicit_new_command: explicitCommand,
      route_mode: route?.mode ?? null,
      classification_kind: classification?.kind ?? null,
      write_domain: writeDomain,
    },
  };

  if (pendingAction && pendingIntent?.intent === 'cancel') {
    return finalizeContract({
      ...base,
      winning_path: 'pending_action',
      intent_type: 'pending_cancellation',
      source_of_write_intent: CONTRACT_SOURCES.PENDING,
      allowed_context_sources: [CONTRACT_SOURCES.CURRENT, CONTRACT_SOURCES.PENDING],
      disallowed_steals: ['proactive_reply', 'memory_recall', 'working_context_fields'],
      confidence: 0.96,
      reasons: ['Active pending action plus cancellation reply.'],
    });
  }

  if (pendingAction && pendingIntent?.intent === 'clarify') {
    return finalizeContract({
      ...base,
      winning_path: 'pending_action',
      intent_type: 'pending_clarification',
      source_of_write_intent: 'none',
      allowed_context_sources: [CONTRACT_SOURCES.CURRENT, CONTRACT_SOURCES.PENDING],
      disallowed_steals: ['proactive_reply', 'memory_recall'],
      confidence: 0.92,
      reasons: ['Active pending action plus clarification reply.'],
    });
  }

  if (pendingAction && explicitCommand) {
    return finalizeContract({
      ...base,
      winning_path: 'explicit_command',
      intent_type: 'new_write',
      source_of_write_intent: CONTRACT_SOURCES.CURRENT,
      allowed_context_sources: [CONTRACT_SOURCES.CURRENT],
      disallowed_steals: ['pending_action', 'proactive_reply', 'memory_recall', 'working_context_fields'],
      confidence: 0.9,
      reasons: ['Current message is a content-bearing explicit command, so stale pending action cannot handle it.'],
    });
  }

  const proactiveWins = source === 'whatsapp' && shouldPrioritizeProactiveReplyOverPending({
    message, brainChat, activePendingAction: pendingAction, now,
  }).prioritize;
  if (pendingAction && pendingIntent?.intent === 'confirm' && !proactiveWins) {
    return finalizeContract({
      ...base,
      winning_path: 'pending_action',
      intent_type: 'pending_confirmation',
      source_of_write_intent: CONTRACT_SOURCES.PENDING,
      allowed_context_sources: [CONTRACT_SOURCES.CURRENT, CONTRACT_SOURCES.PENDING],
      disallowed_steals: ['memory_recall'],
      confidence: 0.88,
      reasons: ['Active pending action plus short confirmation reply.'],
    });
  }

  if (pendingAction && !proactiveWins && isPotentialPendingSlotFill({ message, pendingAction, workingContext })) {
    return finalizeContract({
      ...base,
      winning_path: 'pending_action',
      intent_type: 'pending_slot_fill',
      source_of_write_intent: CONTRACT_SOURCES.PENDING,
      allowed_context_sources: [CONTRACT_SOURCES.CURRENT, CONTRACT_SOURCES.PENDING, CONTRACT_SOURCES.WORKING],
      disallowed_steals: ['memory_recall'],
      field_policy: { ...fieldPolicy, allow_pending_slot_fill: true },
      confidence: 0.82,
      reasons: ['Current message is a plausible slot-fill for the active pending action.'],
    });
  }

  if (source === 'whatsapp' && proactiveIntent !== 'other' && proactiveSelection?.type !== 'none') {
    return finalizeContract({
      ...base,
      winning_path: 'proactive_reply',
      intent_type: 'proactive_reply',
      source_of_write_intent: CONTRACT_SOURCES.PROACTIVE,
      allowed_context_sources: [CONTRACT_SOURCES.CURRENT, CONTRACT_SOURCES.PROACTIVE, CONTRACT_SOURCES.WORKING],
      disallowed_steals: ['memory_recall'],
      confidence: proactiveSelection.type === 'target' ? 0.84 : 0.72,
      reasons: [`WhatsApp reply matches proactive reminder context (${proactiveSelection.type}).`],
    });
  }

  if (looksLikeOperationalContextQuestion(message)) {
    return finalizeContract({
      ...base,
      winning_path: 'operational_context',
      intent_type: 'operational_follow_up',
      source_of_write_intent: 'none',
      allowed_context_sources: [CONTRACT_SOURCES.CURRENT, CONTRACT_SOURCES.WORKING],
      disallowed_steals: ['memory_recall', 'vault', 'working_context_fields'],
      confidence: 0.88,
      reasons: ['Current message asks about the latest LifeOS operation.'],
    });
  }

  if (looksLikeAgendaQuery(message)) {
    return finalizeContract({
      ...base,
      winning_path: 'read_only_query',
      intent_type: 'agenda_query',
      source_of_write_intent: 'none',
      allowed_context_sources: [CONTRACT_SOURCES.CURRENT],
      disallowed_steals: ['memory_recall', 'vault', 'working_context_fields'],
      confidence: 0.9,
      reasons: ['Current message asks for agenda/schedule/task data.'],
    });
  }

  if (isTrueLongTermMemoryRecallRequest(message)) {
    return finalizeContract({
      ...base,
      winning_path: 'memory_recall',
      intent_type: 'true_memory_recall',
      source_of_write_intent: 'none',
      allowed_context_sources: [CONTRACT_SOURCES.CURRENT, CONTRACT_SOURCES.MEMORY],
      disallowed_steals: ['pending_action', 'proactive_reply'],
      field_policy: {
        ...fieldPolicy,
        allow_working_context_exact_fields: false,
        require_current_message_grounding: false,
      },
      confidence: 0.92,
      reasons: ['Current message explicitly asks for long-term memory.'],
    });
  }

  if (classification?.kind === 'memory_write' || looksLikeMemoryWrite(normalized)) {
    return finalizeContract({
      ...base,
      winning_path: 'explicit_command',
      intent_type: 'memory_write',
      source_of_write_intent: CONTRACT_SOURCES.CURRENT,
      allowed_context_sources: [CONTRACT_SOURCES.CURRENT],
      disallowed_steals: ['pending_action', 'proactive_reply', 'memory_recall', 'working_context_fields'],
      confidence: 0.85,
      reasons: ['Current message explicitly asks to store a durable memory.'],
    });
  }

  if (explicitCommand || route?.mode === 'explicit_action' || classification?.kind === 'explicit_action') {
    return finalizeContract({
      ...base,
      winning_path: 'explicit_command',
      intent_type: 'new_write',
      source_of_write_intent: CONTRACT_SOURCES.CURRENT,
      allowed_context_sources: referential
        ? [CONTRACT_SOURCES.CURRENT, CONTRACT_SOURCES.WORKING]
        : [CONTRACT_SOURCES.CURRENT],
      disallowed_steals: referential
        ? ['memory_recall']
        : ['pending_action', 'memory_recall', 'working_context_fields'],
      confidence: explicitCommand ? 0.82 : 0.7,
      reasons: ['Current message carries write/action intent.'],
    });
  }

  if (route?.mode === 'follow_up_transform' || classification?.kind === 'follow_up_transform') {
    return finalizeContract({
      ...base,
      winning_path: 'follow_up_transform',
      intent_type: 'analysis',
      allowed_context_sources: [CONTRACT_SOURCES.CURRENT, CONTRACT_SOURCES.WORKING],
      disallowed_steals: ['pending_action', 'proactive_reply', 'memory_recall'],
      confidence: 0.72,
      reasons: ['Current message transforms a recent assistant answer.'],
    });
  }

  if (route?.mode === 'read_only_analysis' || classification?.kind === 'read_only_analysis') {
    return finalizeContract({
      ...base,
      winning_path: 'read_only_query',
      intent_type: 'analysis',
      allowed_context_sources: [CONTRACT_SOURCES.CURRENT, CONTRACT_SOURCES.MEMORY, CONTRACT_SOURCES.VAULT],
      disallowed_steals: ['pending_action', 'proactive_reply'],
      confidence: 0.68,
      reasons: ['Current message asks for read-only analysis.'],
    });
  }

  if (route?.mode === 'clarification' || classification?.kind === 'clarify') {
    return finalizeContract({
      ...base,
      winning_path: 'clarification',
      intent_type: 'unknown',
      allowed_context_sources: [CONTRACT_SOURCES.CURRENT, CONTRACT_SOURCES.WORKING],
      disallowed_steals: ['memory_recall'],
      confidence: 0.6,
      reasons: ['Current message needs clarification before a subsystem can handle it.'],
    });
  }

  return finalizeContract({
    ...base,
    winning_path: 'casual_chat',
    intent_type: 'casual',
    allowed_context_sources: [CONTRACT_SOURCES.CURRENT, CONTRACT_SOURCES.MEMORY],
    disallowed_steals: ['pending_action', 'proactive_reply'],
    confidence: 0.5,
    reasons: ['No stronger Brain turn path matched.'],
  });
}

export function serializeBrainTurnContract(contract) {
  if (!contract) return null;
  return sanitizeTraceValue({
    winning_path: contract.winning_path,
    intent_type: contract.intent_type,
    source_of_write_intent: contract.source_of_write_intent,
    allowed_context_sources: contract.allowed_context_sources,
    disallowed_steals: contract.disallowed_steals,
    field_policy: contract.field_policy,
    route_override: contract.route_override ? {
      mode: contract.route_override.mode,
      primary_skill: contract.route_override.primary_skill,
      needs_data: contract.route_override.needs_data,
      label: contract.route_override.label,
    } : null,
    write_domain: contract.write_domain,
    confidence: contract.confidence,
    reasons: contract.reasons,
  });
}

export function contractDisallows(contract, subsystem) {
  return Array.isArray(contract?.disallowed_steals) && contract.disallowed_steals.includes(subsystem);
}

function buildFieldPolicy({ message, referential, explicitCommand }) {
  const vagueUngrounded = hasVagueTimeWithoutExactTime(message);
  return {
    allow_working_context_exact_fields: Boolean(referential),
    allow_ai_inferred_exact_times: !vagueUngrounded,
    require_current_message_grounding: Boolean(explicitCommand && !referential),
    allow_pending_slot_fill: false,
  };
}

function hasVagueTimeWithoutExactTime(message) {
  const text = normalizeTurnText(message);
  if (!text) return false;
  const hasVague = /\b(?:domattina|mattina|in mattinata|pomeriggio|sera|stasera|piu tardi|presto|tomorrow morning|morning|afternoon|evening|later|early)\b/.test(text);
  if (!hasVague) return false;
  return !/\b\d{1,2}(?::|\.)[0-5]\d\s*(?:am|pm)?\b/.test(text)
    && !/\b(?:alle|at)\s*\d{1,2}\s*(?:am|pm)?\b/.test(text)
    && !/\b\d{1,2}\s*(?:am|pm)\b/.test(text);
}

function looksLikeMemoryWrite(text) {
  return /^(?:remember that|remember this|ricorda che|ricordati che)\b/.test(text);
}

function finalizeContract(contract) {
  return {
    ...contract,
    allowed_context_sources: unique(contract.allowed_context_sources),
    disallowed_steals: unique(contract.disallowed_steals),
    reasons: unique(contract.reasons).slice(0, 6),
    confidence: Number.isFinite(Number(contract.confidence)) ? Number(contract.confidence) : 0.45,
  };
}

function unique(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}
