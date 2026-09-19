import { createHash } from 'node:crypto';
import {
  cancelQueuedRoutineCandidates,
  getCurrentRoutineBelief,
  recordRoutineNegativeFeedback,
} from './brainBeliefs.js';
import { createCompanionResult, renderCompanionResult } from './brainButler.js';
import { ACCOUNTABILITY_REPLY_TYPE } from './brainProactiveAccountability.js';
import { resolveProactiveWhatsappReply } from './brainProactiveReplies.js';
import {
  applyRoutineSemanticOperation,
  inferRoutineIdFromMessage,
  inferRoutineStateChange,
  serializeRoutineSemanticResult,
} from './brainRoutineSemantics.js';

export async function runStandaloneRoutineSemanticTurn({
  message,
  context = {},
  now = new Date(),
  actions = defaultCompanionActions,
} = {}) {
  const routineId = inferRoutineIdFromMessage(message);
  if (!routineId) return null;
  let currentBelief;
  let semantic;
  try {
    currentBelief = await actions.getCurrentRoutineBelief({ routineId });
    semantic = await actions.inferRoutineStateChange({ message, currentBelief, now });
  } catch {
    return null;
  }
  if (!semantic?.persist) return null;
  const idempotencyBase = buildCompanionIdempotencyBase({ context, message, target: null });
  const belief = await actions.applyRoutineSemanticOperation({
    semantic,
    idempotencyKey: `${idempotencyBase}:semantic:${semantic.operation}`,
    sourceRef: buildSourceRef({ context, target: null }),
    provenance: { path: 'standalone_routine_semantic_turn' },
  });
  if (['inactive', 'suspended', 'uncertain'].includes(belief?.value?.state)) {
    await actions.cancelQueuedRoutineCandidates({ routineId, reason: `routine_${belief.value.state}`, now });
  }
  const companionResult = createCompanionResult({
    reason: semantic.operation === 'stale_assumption' ? 'stale_world_model' : 'accountability',
    deterministicResult: null,
    semantic,
    belief,
    residualText: semantic.residual_text,
    language: context?.workingContext?.language || 'it',
    channel: context?.source || 'app',
  });
  const answer = await actions.renderCompanionResult({ result: companionResult });
  return {
    answer,
    plan: {
      intent: 'update_companion_belief',
      needsRead: true,
      needsWrite: true,
      riskLevel: 'low',
      args: { routine_id: routineId, state: semantic.state },
      reasoning: 'Applied a validated user-explicit routine-state change.',
    },
    actions: [{
      type: 'update_companion_belief',
      data: { belief_id: belief?.id, routine_id: routineId, state: semantic.state },
    }],
    contextSummary: null,
    companion_result: companionResult,
    skipMemoryExtraction: !semantic.residual_text,
    ...(semantic.residual_text ? { memory_extraction_message: semantic.residual_text } : {}),
  };
}

export async function runCompanionProactiveTurn({
  message,
  brainChat,
  context = {},
  selection = null,
  now = new Date(),
  actions = defaultCompanionActions,
} = {}) {
  const target = selection?.proactive;
  const routineId = target?.accountability?.kind === 'habit_missing'
    ? target.accountability.habit_id
    : null;
  if (!routineId || selection?.reply_type !== ACCOUNTABILITY_REPLY_TYPE) {
    const result = await actions.resolveProactive({ message, brainChat, context, now, selection });
    return result ? { handled: true, result, companion_result: null, trace: { path: 'legacy_proactive' } } : null;
  }

  let currentBelief = null;
  let semantic = null;
  let semanticError = null;
  try {
    currentBelief = await actions.getCurrentRoutineBelief({ routineId });
    semantic = await actions.inferRoutineStateChange({
      message,
      targetRoutineId: routineId,
      currentBelief,
      now,
    });
  } catch (error) {
    semanticError = safeErrorCode(error);
    semantic = { operation: 'no_change', persist: false, validation_reason: 'semantic_inference_failed' };
  }

  const deterministicSelection = selectionForDeterministicResolution(selection, semantic);
  const deterministicResult = deterministicSelection
    ? await actions.resolveProactive({ message, brainChat, context, now, selection: deterministicSelection })
    : null;
  if (!deterministicResult && !semantic?.persist) return null;

  const sourceRef = buildSourceRef({ context, target });
  const idempotencyBase = buildCompanionIdempotencyBase({ context, message, target });
  let belief = null;
  let negativeFeedback = null;
  if (semantic?.persist) {
    belief = await actions.applyRoutineSemanticOperation({
      semantic,
      idempotencyKey: `${idempotencyBase}:semantic:${semantic.operation}`,
      sourceRef,
      provenance: {
        path: 'compound_proactive_reply',
        target_selection_method: selection?.selection_method || context?.interactionSelection?.selection_method || null,
      },
    });
    if (['inactive', 'suspended', 'uncertain'].includes(belief?.value?.state)) {
      await actions.cancelQueuedRoutineCandidates({
        routineId,
        reason: `routine_${belief.value.state}`,
        now,
      });
    }
  } else if (deterministicSelection?.intent?.intent === 'no') {
    negativeFeedback = await actions.recordRoutineNegativeFeedback({
      routineId,
      sourceRef,
      provenance: {
        path: 'compound_proactive_reply',
        reply_kind: 'ambiguous_negative',
      },
      idempotencyKey: `${idempotencyBase}:negative_feedback`,
      now,
    });
  }

  const residualText = semantic?.residual_text || null;
  const companionResult = createCompanionResult({
    reason: semantic?.operation === 'stale_assumption' ? 'stale_world_model' : 'accountability',
    target,
    deterministicResult,
    semantic: semantic?.persist ? semantic : null,
    belief,
    residualText,
    language: target?.language || target?.working_context?.language || 'it',
    channel: 'whatsapp',
  });
  const answer = await actions.renderCompanionResult({
    result: companionResult,
    fallbackAnswer: deterministicResult?.answer,
  });
  const result = {
    ...(deterministicResult || buildSemanticOnlyResult()),
    answer,
    companion_result: companionResult,
    skipMemoryExtraction: !residualText,
    ...(residualText ? { memory_extraction_message: residualText } : {}),
    proactive_reply_trace: {
      ...(deterministicResult?.proactive_reply_trace || {}),
      companion: true,
      semantic: serializeRoutineSemanticResult(semantic),
      semantic_error: semanticError,
      belief_updated: Boolean(belief),
      negative_feedback_recorded: Boolean(negativeFeedback),
      residual_preserved: Boolean(residualText),
    },
  };
  if (belief) {
    result.plan = {
      ...result.plan,
      intent: 'compound_proactive_reply',
      needsWrite: true,
      reasoning: 'Resolved the owned proactive target and applied a validated routine-state change.',
    };
    result.actions = [
      ...(result.actions || []),
      {
        type: 'update_companion_belief',
        data: {
          belief_id: belief.id,
          routine_id: routineId,
          state: belief.value?.state,
        },
      },
    ];
  }
  return {
    handled: true,
    result,
    companion_result: companionResult,
    trace: result.proactive_reply_trace,
  };
}

function selectionForDeterministicResolution(selection, semantic) {
  const intent = selection?.intent?.intent;
  if (intent && intent !== 'other') return selection;
  if (!semantic?.persist) return null;
  return {
    ...selection,
    intent: {
      intent: 'no',
      confidence: semantic.confidence,
      normalized: 'semantic_routine_state_change',
    },
  };
}

function buildSemanticOnlyResult() {
  return {
    plan: {
      intent: 'companion_state_update',
      needsRead: false,
      needsWrite: true,
      riskLevel: 'low',
      args: {},
      reasoning: 'Applied a validated routine-state update for the owned proactive target.',
    },
    actions: [],
    contextSummary: null,
    working_context: null,
  };
}

function buildSourceRef({ context, target }) {
  return {
    channel: 'whatsapp',
    thread_id: context?.brainChat?.thread?.id || context?.thread?.id || null,
    message_id: context?.brainChat?.userMessage?.id || null,
    assistant_message_id: context?.interactionSelection?.assistant_message_id || null,
    outbox_message_id: target?.outbox_message_id || null,
  };
}

function buildCompanionIdempotencyBase({ context, message, target }) {
  const stableId = context?.brainChat?.userMessage?.id || context?.clientRequestId;
  if (stableId) return `companion:${stableId}`;
  const digest = createHash('sha256')
    .update(`${context?.brainChat?.thread?.id || ''}|${target?.outbox_message_id || ''}|${String(message || '')}`)
    .digest('hex')
    .slice(0, 24);
  return `companion:fallback:${digest}`;
}

function safeErrorCode(error) {
  const status = Number(error?.status);
  if (status === 429) return 'provider_rate_limited';
  if (status >= 500) return 'provider_unavailable';
  return 'semantic_inference_error';
}

const defaultCompanionActions = {
  resolveProactive: resolveProactiveWhatsappReply,
  getCurrentRoutineBelief,
  inferRoutineStateChange,
  applyRoutineSemanticOperation,
  recordRoutineNegativeFeedback,
  cancelQueuedRoutineCandidates,
  renderCompanionResult,
};
