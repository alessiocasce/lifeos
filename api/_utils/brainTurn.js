import { extractLatestPendingAction, normalizePendingReplyIntent } from './brainPendingActions.js';
import { shouldPrioritizeProactiveReplyOverPending } from './brainProactiveReplies.js';
import { buildBrainWorkingContext } from './brainWorkingContext.js';
import { addBrainTraceStep, createBrainTrace, safePreview } from './brainTrace.js';

export function createBrainTurn({
  message,
  source = 'app',
  responseMode = null,
  requestId = null,
  clientRequestId = null,
  channelMetadata = null,
  debugFlags = null,
  endpointTrace = null,
} = {}) {
  const normalizedMessage = String(message ?? '').trim();
  const turn = {
    requestId: requestId || `brain-${Date.now()}`,
    clientRequestId,
    source,
    responseMode: responseMode || null,
    message: normalizedMessage,
    channelMetadata: channelMetadata && typeof channelMetadata === 'object' ? channelMetadata : null,
    debugFlags: debugFlags && typeof debugFlags === 'object' ? debugFlags : { enabled: false, requested: false, full: false },
    stages: [],
  };

  turn.brainTrace = createBrainTrace({
    source,
    responseMode: turn.responseMode || source,
    clientRequestId,
    userText: normalizedMessage,
    channelMetadata: turn.channelMetadata,
    endpoint: endpointTrace,
    full: turn.debugFlags.full,
  });
  recordBrainTurnStage(turn, 'inbound_received', {
    source,
    response_mode: turn.responseMode || source,
    client_request_id: clientRequestId,
    user_text_preview: safePreview(normalizedMessage),
    whatsapp_sender: turn.channelMetadata?.whatsapp_sender,
    whatsapp_message_id: turn.channelMetadata?.whatsapp_message_id,
  });
  return turn;
}

export function recordBrainTurnStage(turn, stepName, data = {}) {
  if (!turn || !stepName) return turn;
  if (!Array.isArray(turn.stages)) turn.stages = [];
  turn.stages.push({
    step: stepName,
    data,
  });
  addBrainTraceStep(turn.brainTrace, stepName, data);
  return turn;
}

export function attachBrainChatToTurn(turn, brainChat) {
  if (!turn) return turn;
  turn.brainChat = brainChat;
  turn.thread = brainChat?.thread ?? null;
  turn.userMessage = brainChat?.userMessage ?? null;
  turn.history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  turn.brainTrace.thread_id = turn.thread?.id ?? null;
  turn.brainTrace.user_message_id = turn.userMessage?.id ?? null;
  recordBrainTurnStage(turn, 'thread_resolved', {
    thread_id: turn.thread?.id,
    user_message_id: turn.userMessage?.id,
    history_count: turn.history.length,
    source: brainChat?.source,
  });
  return turn;
}

export function attachBrainContextToTurn(turn, brainContext) {
  if (!turn) return turn;
  turn.brainContext = brainContext;
  recordBrainTurnStage(turn, 'memory_context_loaded', {
    memories: brainContext?.memories?.length ?? 0,
    insights: brainContext?.insights?.length ?? 0,
  });
  return turn;
}

export function buildBrainTurnWorkingContext(turn, { lifeosContext = null } = {}) {
  if (!turn) return null;
  turn.workingContext = buildBrainWorkingContext({
    brainChat: turn.brainChat,
    currentMessage: turn.message,
    lifeosContext,
  });
  turn.brainTrace.language = turn.workingContext?.language || 'unknown';
  turn.brainTrace.working_context = serializeWorkingContextTrace(turn.workingContext);
  recordBrainTurnStage(turn, 'working_context_built', turn.brainTrace.working_context);
  if (turn.brainChat) {
    turn.brainChat.workingContext = turn.workingContext;
    turn.brainChat.responseMode = turn.responseMode;
    turn.brainChat.channelMetadata = turn.channelMetadata;
  }
  return turn.workingContext;
}

export function checkBrainTurnPendingAction(turn) {
  if (!turn) return { activePendingAction: null, pendingReplyIntent: null };
  const activePendingAction = extractLatestPendingAction(turn.brainChat);
  const pendingReplyIntent = activePendingAction ? normalizePendingReplyIntent(turn.message) : null;
  turn.pendingAction = activePendingAction;
  turn.pendingReplyIntent = pendingReplyIntent;
  turn.brainTrace.pending_action = activePendingAction ? {
    found: true,
    id: activePendingAction.id,
    type: activePendingAction.action_type,
    status: activePendingAction.status,
    source_message_id: activePendingAction.source_user_message_id,
    missing_fields: activePendingAction.missing_fields,
  } : { found: false };
  turn.brainTrace.pending_reply_intent = pendingReplyIntent?.intent ?? null;
  recordBrainTurnStage(turn, 'pending_action_checked', {
    pending_action: turn.brainTrace.pending_action,
    pending_reply_intent: turn.brainTrace.pending_reply_intent,
  });
  return { activePendingAction, pendingReplyIntent };
}

export function checkBrainTurnProactivePriority(turn, { activePendingAction = turn?.pendingAction, now = undefined } = {}) {
  if (!turn || !activePendingAction || turn.source !== 'whatsapp') {
    return { prioritize: false, reason: !activePendingAction ? 'no_pending_action' : 'not_whatsapp', intent: 'other' };
  }
  const proactivePriority = shouldPrioritizeProactiveReplyOverPending({
    message: turn.message,
    brainChat: turn.brainChat,
    activePendingAction,
    now,
  });
  if (proactivePriority.prioritize) {
    turn.brainTrace.proactive_reply_priority = proactivePriority;
    recordBrainTurnStage(turn, 'proactive_reply_prioritized_before_pending', proactivePriority);
  }
  return proactivePriority;
}

export function markBrainTurnProactiveBypassedPending(turn, { activePendingAction, priority } = {}) {
  if (!turn) return null;
  const bypass = {
    bypass: true,
    reason: `proactive_reply_${priority?.reason || 'prioritized'}`,
    confidence: 0.9,
    pending_action_type: activePendingAction?.action_type ?? turn.pendingAction?.action_type ?? null,
  };
  turn.brainTrace.pending_resolution = 'not_handled';
  turn.brainTrace.pending_action_bypass = bypass;
  return bypass;
}

export function recordBrainTurnPendingResolution(turn, resolution, activePendingAction, traceName) {
  if (!turn) return turn;
  turn.pendingResolution = resolution ?? null;
  turn.brainTrace.pending_resolution = resolution?.handled ? traceName : 'not_handled';
  if (resolution?.bypassed) {
    turn.brainTrace.pending_action_bypass = {
      bypass: true,
      reason: resolution.reason || resolution.pending_action_bypass?.reason || 'new_command',
      confidence: resolution.confidence ?? resolution.pending_action_bypass?.confidence ?? null,
      pending_action_type: resolution.pending_action?.action_type ?? activePendingAction?.action_type ?? null,
    };
  }
  recordBrainTurnStage(turn, 'pending_action_resolved', {
    handled: Boolean(resolution?.handled),
    bypassed: Boolean(resolution?.bypassed),
    type: resolution?.type ?? null,
    pending_resolution: turn.brainTrace.pending_resolution,
    pending_action_bypass: turn.brainTrace.pending_action_bypass ?? null,
  });
  return turn;
}

export function recordBrainTurnClassification(turn, classification) {
  if (!turn) return turn;
  turn.brainClassification = classification;
  recordBrainTurnStage(turn, 'deterministic_classification', classification);
  return turn;
}

export function recordBrainTurnRoute(turn, route) {
  if (!turn) return turn;
  turn.brainRoute = route;
  turn.brainTrace.route = route?.mode ?? null;
  recordBrainTurnStage(turn, 'route_selected', {
    mode: route?.mode,
    primary_skill: route?.primary_skill,
    confidence: route?.confidence,
    write_intent: route?.write_intent,
    proposed_action_types: route?.proposed_action_types,
    needs_data: route?.needs_data,
  });
  return turn;
}

export function recordBrainTurnSkill(turn, brainSkill) {
  if (!turn) return turn;
  turn.brainSkill = brainSkill;
  turn.brainTrace.selected_skill = brainSkill?.skill?.id ?? brainSkill?.id ?? null;
  recordBrainTurnStage(turn, 'skill_selected', {
    skill: turn.brainTrace.selected_skill,
    confidence: brainSkill?.confidence,
    reason: brainSkill?.reason,
  });
  return turn;
}

export function recordBrainTurnVault(turn, brainVault, { documentCount = 0 } = {}) {
  if (!turn) return turn;
  turn.brainVault = brainVault;
  turn.brainTrace.vault = {
    attempted: Boolean(brainVault?.attempted),
    used: Number(brainVault?.results?.length ?? 0) > 0,
    chunks: brainVault?.results?.length ?? 0,
    documents: documentCount,
  };
  recordBrainTurnStage(turn, 'vault_context_loaded', turn.brainTrace.vault);
  return turn;
}

function serializeWorkingContextTrace(workingContext) {
  return {
    used: Boolean(workingContext),
    last_subject_type: workingContext?.last_subject?.type ?? null,
    last_subject_label: workingContext?.last_subject?.label ?? null,
    last_action_type: workingContext?.last_action_result?.action_type ?? null,
    referents: Array.isArray(workingContext?.referents) ? workingContext.referents.length : 0,
  };
}
