import {
  HttpError,
  createRequestContext,
  handleApiError,
  handleOptions,
  readJsonBody,
  requirePost,
  sendSuccess,
} from '../_utils/http.js';
import { addBrainTraceStep, getDebugFlags } from '../_utils/brainTrace.js';
import {
  answerFollowUpTransform,
  answerWithGemini,
  appendWorkoutReadOnlyConfirmation,
  attachDebugDiagnostics,
  formatVaultSaveAnswer,
  friendlyDayScheduleError,
  getLatestAssistantMessage,
  inferVaultDocumentTypeFromMessage,
  inferVaultTagsFromSkill,
  isSaveToVaultRequest,
  logAiPlannerFailure,
  logAiWriteFailure,
  safeLogAiError,
} from '../_utils/chat/chatScheduleParsing.js';
import { archiveMatchingBrainMemory, extractExplicitMemoryCommand, persistExplicitBrainMemory } from '../_utils/brain.js';
import {
  attachBrainChatToTurn,
  attachBrainContextToTurn,
  buildBrainTurnWorkingContext,
  checkBrainTurnPendingAction,
  checkBrainTurnProactivePriority,
  createBrainTurn,
  evaluateBrainTurnContract,
  markBrainTurnProactiveBypassedPending,
  prepareBrainTurnInteraction,
  recordBrainTurnClassification,
  recordBrainTurnPendingResolution,
  recordBrainTurnRoute,
  recordBrainTurnSkill,
  recordBrainTurnVault,
} from '../_utils/brainTurn.js';
import { buildOperationalContextAnswer, buildOperationalContextClarification } from '../_utils/brainTurnArbitration.js';
import {
  classifyBrainMessage,
  createClarificationBrainPlan,
  createReadOnlyBrainPlan,
  enforceBrainSkillWritePermission,
  enforceBrainWriteRestraint,
  getSafeClarificationQuestion,
  hasNegativeWriteIntent,
  mergeBrainRouteIntoPlan,
  routeMemoryCommand,
  selectBrainSkillFromRoute,
  serializeSkillSelection,
} from '../_utils/chat/chatClassification.js';
import { closeBrainInteraction } from '../_utils/brainWhatsappReliability.js';
import {
  createDayScheduleSyntheticPlan,
  createExplicitCalendarSyntheticPlan,
  createFiniteRecurringCalendarSyntheticPlan,
  enforceWorkoutAdviceReadOnly,
  executeDaySchedulePlan,
  executeExplicitCalendarPlan,
  executeFiniteRecurringCalendarPlan,
  executeWriteIntent,
  isDaySchedulePlannerGuard,
  isExplicitMultiEventCalendarRequest,
  isFiniteRecurringCalendarRequest,
  isObviousDayScheduleRequest,
  isObviousExplicitMultiEventCalendarRequest,
  isWorkoutAdviceOnlyRequest,
  planMessage,
} from '../_utils/chat/chatCalendarPlanning.js';
import { createVaultDocumentFromMessage } from '../_utils/brainVault.js';
import {
  finalizeBrainTraceForResponse,
  maybeAttachDebug,
  normalizeAssistantSource,
  pendingResolutionTraceName,
  requireAssistantAuth,
  resolveAssistantSource,
  sendAiSuccess,
  uniqueVaultDocumentCount,
} from '../_utils/chat/chatResponse.js';
import {
  findExistingBrainResponseByClientRequestId,
  normalizeClientRequestId,
  safeBeginBrainChat,
  safeLoadBrainContext,
  safeLoadBrainVaultContext,
  safePersistBrainError,
  safeRouteBrainMessage,
} from '../_utils/chat/chatPersistence.js';
import { formatMemoryForgetAnswer, formatMemoryRecallAnswer, isMemoryRecallRequest } from '../_utils/chat/chatMemoryAnswers.js';
import {
  formatQuotedTargetClarification,
  handlePendingActionResolution,
  maybeCreatePendingActionCandidate,
  maybeHandleCommandDraft,
  maybeResolveProactiveWhatsappReply,
} from '../_utils/chat/chatPendingActions.js';
import { readLifeOSContext } from '../_utils/lifeosTools.js';
import { resolveExplicitHealthSelfReport } from '../_utils/brainHealthSelfReports.js';
import { resolvePendingActionTurn } from '../_utils/brainPendingActions.js';
import { runBrainPlannerStage } from '../_utils/brainPlannerStage.js';
import { runStandaloneRoutineSemanticTurn } from '../_utils/brainCompanionTurn.js';
import { serializeBrainRoute } from '../_utils/brainRouter.js';

export { safeExtractBrainKnowledge } from '../_utils/chat/chatPersistence.js';
export { classifyBrainMessage, hasNegativeWriteIntent } from '../_utils/chat/chatClassification.js';
export { isExplicitMultiEventCalendarRequest, isFiniteRecurringCalendarRequest, hasExplicitCalendarCreationRequest, isWorkoutAdviceOnlyRequest, enforceWorkoutAdviceReadOnly, isObviousDayScheduleRequest, isObviousExplicitMultiEventCalendarRequest, normalizeFiniteRecurrencePlan, getRecurrenceClarifyingQuestion, expandRecurrenceToEvents, extractDayScheduleEventsLocally, extractExplicitCalendarEventsLocally } from '../_utils/chat/chatCalendarPlanning.js';

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    const debugFlags = getDebugFlags(req);
    const authInfo = await requireAssistantAuth(req);

    const body = await readJsonBody(req);
    const message = String(body.message ?? '').trim();
    if (!message) throw new HttpError(400, 'message is required.');
    if (message.length > 2000) throw new HttpError(400, 'message must be 2000 characters or fewer.');
    const clientRequestId = normalizeClientRequestId(body.client_request_id ?? body.clientRequestId);
    const source = resolveAssistantSource(authInfo, body);
    const result = await handleBrainChatMessage({
      message,
      threadId: body.thread_id,
      source,
      requestId: context.requestId,
      clientRequestId,
      debugFlags,
    });
    return sendSuccess(res, 200, result, context);
  } catch (error) {
    handleApiError(res, error, context);
  }
}

export async function handleBrainChatMessage({
  message,
  threadId = null,
  source = 'app',
  requestId = null,
  clientRequestId = null,
  channelMetadata = null,
  responseMode = null,
  debugFlags = null,
  endpointTrace = null,
} = {}) {
  const normalizedMessage = String(message ?? '').trim();
  if (!normalizedMessage) throw new HttpError(400, 'message is required.');
  if (normalizedMessage.length > 4000) throw new HttpError(400, 'message must be 4000 characters or fewer.');
  const resolvedSource = normalizeAssistantSource(source);
  const context = createBrainTurn({
    message: normalizedMessage,
    source: resolvedSource,
    responseMode,
    requestId,
    clientRequestId: normalizeClientRequestId(clientRequestId),
    channelMetadata,
    debugFlags,
    endpointTrace,
  });
  const messageForBrain = normalizedMessage;
  try {
    const existingResponse = await findExistingBrainResponseByClientRequestId(context.clientRequestId);
    if (existingResponse) {
      addBrainTraceStep(context.brainTrace, 'idempotent_response_found', {
        client_request_id: context.clientRequestId,
        thread_id: existingResponse.thread_id,
      });
      const trace = finalizeBrainTraceForResponse(context, {
        final_response_type: 'idempotent_replay',
        thread_id: existingResponse.thread_id,
      });
      return maybeAttachDebug(existingResponse, context, trace);
    }

    attachBrainChatToTurn(context, await safeBeginBrainChat({
      threadId,
      source: resolvedSource,
      message: messageForBrain,
      requestId: context.requestId,
      clientRequestId: context.clientRequestId,
      channelMetadata: context.channelMetadata,
    }));
    attachBrainContextToTurn(context, await safeLoadBrainContext(context));
    buildBrainTurnWorkingContext(context);
    const { activePendingAction } = checkBrainTurnPendingAction(context);
    await prepareBrainTurnInteraction(context);
    const turnContract = evaluateBrainTurnContract(context);
    if (context.interactionSelection?.path === 'explicit_health') {
      const healthResult = await resolveExplicitHealthSelfReport({ report: context.interactionSelection.target });
      if (healthResult) {
        addBrainTraceStep(context.brainTrace, 'explicit_health_self_report_handled', healthResult.health_self_report_trace);
        await closeBrainInteraction({
          threadId: context.thread?.id,
          assistantMessageId: context.activeInteraction?.assistant_message_id,
          expectedVersion: context.activeInteraction?.version,
          state: 'superseded',
        });
        return sendAiSuccess(null, 200, healthResult, context, { message: messageForBrain, source: resolvedSource });
      }
    }
    if (context.interactionSelection?.intent === 'abandon') {
      await closeBrainInteraction({
        threadId: context.thread?.id,
        assistantMessageId: context.activeInteraction?.assistant_message_id,
        expectedVersion: context.activeInteraction?.version,
        state: 'abandoned',
      });
      return sendAiSuccess(null, 200, {
        answer: context.workingContext?.language === 'it' ? 'Va bene, lasciamo perdere. Dimmi pure cosa vuoi fare.' : 'Okay, we can drop that. Tell me what you want to do.',
        plan: createReadOnlyBrainPlan('User abandoned unclear conversational context.'),
        actions: [], contextSummary: null, skipMemoryExtraction: true,
      }, context, { message: messageForBrain, source: resolvedSource });
    }
    if (context.interactionSelection?.intent?.startsWith('quoted_')) {
      return sendAiSuccess(null, 200, {
        answer: formatQuotedTargetClarification(context.interactionSelection.intent, context.workingContext?.language),
        plan: createReadOnlyBrainPlan(`Quoted WhatsApp target rejected: ${context.interactionSelection.intent}.`),
        actions: [], contextSummary: null, skipMemoryExtraction: true,
      }, context, { message: messageForBrain, source: resolvedSource });
    }
    if (activePendingAction && resolvedSource === 'whatsapp') {
      const proactivePriority = checkBrainTurnProactivePriority(context, { activePendingAction });
      if (proactivePriority.prioritize) {
        const proactiveResult = await maybeResolveProactiveWhatsappReply({
          message: messageForBrain,
          resolvedSource,
          context,
        });
        if (proactiveResult) {
          markBrainTurnProactiveBypassedPending(context, { activePendingAction, priority: proactivePriority });
          return sendAiSuccess(null, 200, proactiveResult, context, { message: messageForBrain, source: resolvedSource });
        }
      }
    }
    if (activePendingAction && !turnContract?.disallowed_steals?.includes('pending_action')) {
      const pendingResolution = await resolvePendingActionTurn({ message: messageForBrain, pendingAction: activePendingAction, context });
      recordBrainTurnPendingResolution(context, pendingResolution, activePendingAction, pendingResolutionTraceName(pendingResolution?.type));
      if (pendingResolution.handled) {
        const result = await handlePendingActionResolution({
          resolution: pendingResolution,
          context,
          message: messageForBrain,
          source: resolvedSource,
        });
        return sendAiSuccess(null, 200, result, context, { message: messageForBrain, source: resolvedSource });
      }
    } else if (activePendingAction) {
      addBrainTraceStep(context.brainTrace, 'pending_action_blocked_by_contract', {
        winning_path: turnContract?.winning_path,
        intent_type: turnContract?.intent_type,
        reason: 'BrainTurnContract disallowed pending action for this turn.',
      });
    }

    if (!turnContract?.disallowed_steals?.includes('proactive_reply')) {
      const proactiveResult = await maybeResolveProactiveWhatsappReply({
        message: messageForBrain,
        resolvedSource,
        context,
      });
      if (proactiveResult) {
        return sendAiSuccess(null, 200, proactiveResult, context, { message: messageForBrain, source: resolvedSource });
      }
    } else {
      addBrainTraceStep(context.brainTrace, 'proactive_reply_blocked_by_contract', {
        winning_path: turnContract?.winning_path,
        intent_type: turnContract?.intent_type,
      });
    }

    const routineSemanticResult = await runStandaloneRoutineSemanticTurn({
      message: messageForBrain,
      context,
    });
    if (routineSemanticResult) {
      addBrainTraceStep(context.brainTrace, 'companion_routine_state_updated', {
        routine_id: routineSemanticResult.companion_result?.semantic?.routine_id,
        state: routineSemanticResult.companion_result?.semantic?.state,
        operation: routineSemanticResult.companion_result?.semantic?.operation,
        path: 'standalone_routine_semantic_turn',
      });
      return sendAiSuccess(null, 200, routineSemanticResult, context, { message: messageForBrain, source: resolvedSource });
    }

    if (turnContract?.winning_path === 'operational_context') {
      const operationalAnswer = buildOperationalContextAnswer({
        message: messageForBrain,
        workingContext: context.workingContext,
      });
      const answer = operationalAnswer || buildOperationalContextClarification({
        message: messageForBrain,
        workingContext: context.workingContext,
      });
      if (answer) {
        addBrainTraceStep(context.brainTrace, 'operational_context_answered', {
          source: operationalAnswer ? 'working_context' : 'clarification',
          last_subject_type: context.workingContext?.last_subject?.type ?? null,
          last_action_type: context.workingContext?.last_action_result?.action_type ?? null,
        });
        const plan = createReadOnlyBrainPlan(operationalAnswer
          ? 'Answer operational follow-up from latest Brain working context.'
          : 'Clarify operational follow-up because no latest subject is available.');
        return sendAiSuccess(null, 200, {
          answer,
          plan,
          actions: [],
          contextSummary: null,
          skipMemoryExtraction: true,
        }, context, { message: messageForBrain, source: resolvedSource });
      }
    }

    const classification = classifyBrainMessage(messageForBrain, context.brainChat);
    recordBrainTurnClassification(context, classification);
    recordBrainTurnRoute(context, await safeRouteBrainMessage({
      message: messageForBrain,
      source: resolvedSource,
      brainChat: context.brainChat,
      brainContext: context.brainContext,
      classification,
      context,
    }));
    evaluateBrainTurnContract(context, { classification, route: context.brainRoute });
    recordBrainTurnSkill(context, selectBrainSkillFromRoute(context.brainRoute, {
      message: messageForBrain,
      classification,
      brainContext: context.brainContext,
      brainChat: context.brainChat,
    }));
    const negativeWriteIntent = hasNegativeWriteIntent(messageForBrain);
    if (negativeWriteIntent) addBrainTraceStep(context.brainTrace, 'negative_write_intent_detected', { blocked: true });
    const brainVault = await safeLoadBrainVaultContext({
      message: messageForBrain,
      brainRoute: context.brainRoute,
      brainSkill: context.brainSkill,
      context,
    });
    recordBrainTurnVault(context, brainVault, { documentCount: uniqueVaultDocumentCount(brainVault?.results) });

    const commandDraftResult = await maybeHandleCommandDraft({ message: messageForBrain, context, classification, source: resolvedSource });
    if (commandDraftResult) {
      return sendAiSuccess(null, 200, commandDraftResult, context, { message: messageForBrain, source: resolvedSource });
    }

    const pendingCandidateResult = await maybeCreatePendingActionCandidate({ message: messageForBrain, context, classification });
    if (pendingCandidateResult) {
      return sendAiSuccess(null, 200, pendingCandidateResult, context, { message: messageForBrain, source: resolvedSource });
    }

    if (context.brainRoute.mode === 'memory_write') {
      const command = routeMemoryCommand(context.brainRoute) ?? extractExplicitMemoryCommand(message);
      const plan = createReadOnlyBrainPlan('Remember an explicit durable user memory.');
      if (!command) {
        const answer = 'Tell me exactly what to remember, like: "remember my name is Ale."';
        return sendAiSuccess(null, 200, { answer, plan, actions: [], contextSummary: null, selected_skill: serializeSkillSelection(context.brainSkill), brain_route: serializeBrainRoute(context.brainRoute), skipMemoryExtraction: true }, context, { message, source });
      }
      const savedMemory = await persistExplicitBrainMemory({
        memory: command.memory,
        existingMemories: context.brainContext?.memories ?? [],
        channel: resolvedSource,
      });
      const answer = command.response || "Got it - I'll remember that.";
      return sendAiSuccess(null, 200, {
        answer,
        plan,
        actions: [],
        contextSummary: null,
        memory: savedMemory,
        selected_skill: serializeSkillSelection(context.brainSkill),
        brain_route: serializeBrainRoute(context.brainRoute),
        skipMemoryExtraction: true,
      }, context, { message, source });
    }

    if (context.brainRoute.mode === 'memory_recall') {
      if (!isMemoryRecallRequest(messageForBrain)) {
        addBrainTraceStep(context.brainTrace, 'memory_recall_blocked_by_intent_contract', {
          reason: 'not_true_long_term_memory_recall',
        });
        const plan = createReadOnlyBrainPlan('Memory recall was blocked because the current message is not a long-term memory question.');
        const answer = context.workingContext?.language === 'it'
          ? 'Non sembra una domanda sulla memoria a lungo termine. Dimmi se vuoi vedere memoria, agenda o promemoria.'
          : 'This does not look like a long-term memory question. Tell me if you want memory, agenda, or reminders.';
        return sendAiSuccess(null, 200, { answer, plan, actions: [], contextSummary: null, selected_skill: serializeSkillSelection(context.brainSkill), brain_route: serializeBrainRoute(context.brainRoute), skipMemoryExtraction: true }, context, { message: messageForBrain, source: resolvedSource });
      }
      const plan = createReadOnlyBrainPlan('Summarize active long-term memory.');
      const answer = formatMemoryRecallAnswer(context.brainContext);
      return sendAiSuccess(null, 200, { answer, plan, actions: [], contextSummary: null, selected_skill: serializeSkillSelection(context.brainSkill), brain_route: serializeBrainRoute(context.brainRoute), skipMemoryExtraction: true }, context, { message: messageForBrain, source: resolvedSource });
    }

    if (context.brainRoute.mode === 'memory_forget') {
      const plan = createReadOnlyBrainPlan('Direct the user to the explicit memory controls.');
      const result = await archiveMatchingBrainMemory({
        target: context.brainRoute.user_intent_summary || message,
        existingMemories: context.brainContext?.memories ?? [],
      });
      const answer = formatMemoryForgetAnswer(result);
      return sendAiSuccess(null, 200, { answer, plan, actions: [], contextSummary: null, selected_skill: serializeSkillSelection(context.brainSkill), brain_route: serializeBrainRoute(context.brainRoute), skipMemoryExtraction: true }, context, { message, source });
    }

    if (isSaveToVaultRequest(message)) {
      const plan = createReadOnlyBrainPlan('Save the latest assistant answer into Brain Vault.');
      const latestAssistant = getLatestAssistantMessage(context.brainChat);
      if (!latestAssistant) {
        const answer = 'There is no previous Brain answer to save yet.';
        return sendAiSuccess(null, 200, { answer, plan, actions: [], contextSummary: null, skipMemoryExtraction: true }, context, { message, source });
      }
      const document = await createVaultDocumentFromMessage({
        sourceMessageId: latestAssistant.id,
        contentMd: latestAssistant.content,
        documentType: inferVaultDocumentTypeFromMessage(message, context.brainSkill),
        tags: inferVaultTagsFromSkill(context.brainSkill),
        metadata: {
          created_by: 'brain_save_follow_up',
          selected_skill: serializeSkillSelection(context.brainSkill),
          brain_route: serializeBrainRoute(context.brainRoute),
        },
      });
      const answer = formatVaultSaveAnswer(document);
      return sendAiSuccess(null, 200, {
        answer,
        plan,
        actions: [{
          type: 'create_vault_document',
          data: {
            document: {
              id: document.id,
              title: document.title,
              document_type: document.document_type,
              created_at: document.created_at,
            },
          },
        }],
        contextSummary: null,
        skipMemoryExtraction: true,
      }, context, { message, source });
    }

    if (context.brainRoute.mode === 'follow_up_transform') {
      const plan = createReadOnlyBrainPlan(context.brainRoute.reason || classification.reason);
      const answer = await answerFollowUpTransform(message, context.brainChat);
      return sendAiSuccess(null, 200, { answer, plan, actions: [], contextSummary: null, selected_skill: serializeSkillSelection(context.brainSkill), brain_route: serializeBrainRoute(context.brainRoute), skipMemoryExtraction: true }, context, { message, source });
    }

    const plannerStageResult = await runBrainPlannerStage({
      turn: context,
      message,
      source,
      classification,
      negativeWriteIntent,
      createReadOnlyBrainPlan,
      createClarificationBrainPlan,
      getSafeClarificationQuestion,
      answerWithAI: answerWithGemini,
      generatePlannerPlan: async (...args) => {
        try {
          return await planMessage(...args);
        } catch (error) {
          const diagnostics = logAiPlannerFailure({ context, message, error });
          attachDebugDiagnostics(error, diagnostics);
          throw error;
        }
      },
      enforceWorkoutAdviceReadOnly,
      enforceBrainWriteRestraint,
      mergeBrainRouteIntoPlan,
      selectBrainSkillFromRoute,
      enforceBrainSkillWritePermission,
      readLifeOSContext,
      executeWriteIntent,
      isWorkoutAdviceOnlyRequest,
      appendWorkoutReadOnlyConfirmation,
      isFiniteRecurringCalendarRequest,
      createFiniteRecurringCalendarSyntheticPlan,
      executeFiniteRecurringCalendarPlan,
      isObviousDayScheduleRequest,
      createDayScheduleSyntheticPlan,
      executeDaySchedulePlan,
      isObviousExplicitMultiEventCalendarRequest,
      createExplicitCalendarSyntheticPlan,
      executeExplicitCalendarPlan,
      isDaySchedulePlannerGuard,
      isExplicitMultiEventCalendarRequest,
      friendlyDayScheduleError,
      logAiWriteFailure,
      safeLogAiError,
      attachDebugDiagnostics,
    });
    return sendAiSuccess(null, 200, plannerStageResult, context, { message, source });
  } catch (error) {
    await safePersistBrainError(context, error);
    throw error;
  }
}
