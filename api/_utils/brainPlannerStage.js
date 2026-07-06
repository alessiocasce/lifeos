import { canExecuteBrainAction } from './brainRouter.js';
import { addBrainTraceStep, safePreview, sanitizeTraceValue } from './brainTrace.js';

const READ_ONLY_CONTRACT_PATHS = new Set([
  'read_only_query',
  'operational_context',
  'memory_recall',
  'follow_up_transform',
  'casual_chat',
  'clarification',
]);

const WRITE_INTENTS = new Set([
  'create_expense',
  'create_calendar_event',
  'create_calendar_events',
  'create_memo',
  'update_health_log',
  'log_sleep_start',
  'analyze_and_plan',
]);

const UNSAFE_WRITE_INTENTS = new Set([
  'delete',
  'remove',
  'archive',
  'wipe',
  'blocked_destructive',
]);

export async function runBrainPlannerStage({
  turn,
  message = turn?.message,
  source = turn?.source,
  classification = null,
  negativeWriteIntent = false,
  createReadOnlyBrainPlan,
  createClarificationBrainPlan,
  getSafeClarificationQuestion,
  answerWithAI,
  generatePlannerPlan,
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
} = {}) {
  const context = turn;
  if (!context) return null;
  addBrainTraceStep(context.brainTrace, 'planner_stage_started', {
    route: context.brainRoute?.mode,
    skill: context.brainSkill?.skill?.id || context.brainSkill?.id,
    contract_path: context.brainTurnContract?.winning_path,
    contract_intent: context.brainTurnContract?.intent_type,
  });

  if (context.brainRoute?.mode === 'clarification' || context.brainRoute?.needs_clarification) {
    const plan = createClarificationBrainPlan(context.brainRoute);
    const answer = getSafeClarificationQuestion({
      message,
      plan,
      brainRoute: context.brainRoute,
      brainSkill: context.brainSkill,
      negative: negativeWriteIntent,
    });
    addBrainTraceStep(context.brainTrace, 'planner_read_only_answered', {
      reason: 'route_clarification',
      action_count: 0,
    });
    return completePlannerStage(context, {
      answer,
      plan: { ...plan, clarifyingQuestion: answer },
      actions: [],
      contextSummary: null,
      skipMemoryExtraction: true,
    });
  }

  if (context.brainRoute?.mode === 'casual_chat') {
    const plan = createReadOnlyBrainPlan(context.brainRoute.reason || classification?.reason || 'Casual chat.');
    const answer = await answerWithAI(message, plan, null, [], context.brainContext, context.brainChat, context.brainSkill, context.brainRoute, context.brainVault);
    addBrainTraceStep(context.brainTrace, 'planner_read_only_answered', {
      reason: 'casual_chat',
      action_count: 0,
    });
    return completePlannerStage(context, {
      answer,
      plan,
      actions: [],
      contextSummary: null,
      skipMemoryExtraction: true,
    });
  }

  const synthetic = buildSyntheticPlannerAction({
    message,
    context,
    negativeWriteIntent,
    isFiniteRecurringCalendarRequest,
    createFiniteRecurringCalendarSyntheticPlan,
    executeFiniteRecurringCalendarPlan,
    isObviousDayScheduleRequest,
    createDayScheduleSyntheticPlan,
    executeDaySchedulePlan,
    isObviousExplicitMultiEventCalendarRequest,
    createExplicitCalendarSyntheticPlan,
    executeExplicitCalendarPlan,
  });
  if (synthetic) {
    const blocked = validatePlannerPlanAgainstTurnContract({
      plan: synthetic.plan,
      message,
      turn: context,
      brainRoute: context.brainRoute,
      brainSkill: context.brainSkill,
      negativeWriteIntent,
    });
    addBrainTraceStep(context.brainTrace, 'planner_plan_validated', validationTrace(blocked));
    if (blocked.writeBlocked) {
      addBrainTraceStep(context.brainTrace, 'planner_write_blocked_by_contract', validationTrace(blocked));
      return answerBlockedPlannerWrite({
        context,
        message,
        plan: blocked.plan,
        negativeWriteIntent,
        getSafeClarificationQuestion,
        createClarificationBrainPlan,
        createReadOnlyBrainPlan,
        answerWithAI,
      });
    }
    try {
      const writeResult = await synthetic.execute(message, synthetic.plan);
      addBrainTraceStep(context.brainTrace, 'planner_action_executed', {
        action_type: synthetic.plan.intent,
        action_count: writeResult.actions?.length ?? 0,
        source_path: synthetic.name,
      });
      return completePlannerStage(context, {
        answer: writeResult.answer,
        plan: synthetic.plan,
        actions: writeResult.actions ?? [],
        contextSummary: null,
      });
    } catch (error) {
      await handlePlannerWriteError({
        error,
        context,
        message,
        source,
        plan: synthetic.plan,
        writePath: synthetic.errorPath,
        friendly: synthetic.friendlyError,
        friendlyDayScheduleError,
        logAiWriteFailure,
        safeLogAiError,
        attachDebugDiagnostics,
      });
    }
  }

  let plan;
  try {
    plan = await generatePlannerPlan(message, context.brainContext, context.brainChat, context.brainSkill, context.brainRoute, context.brainVault);
    addBrainTraceStep(context.brainTrace, 'planner_plan_generated', summarizePlannerPlan(plan));
  } catch (error) {
    throw error;
  }

  plan = enforceWorkoutAdviceReadOnly(message, plan);
  plan = enforceBrainWriteRestraint(message, plan, classification, context.brainRoute, context.brainSkill);
  plan = mergeBrainRouteIntoPlan(plan, context.brainRoute, context.brainSkill);
  context.brainSkill = selectBrainSkillFromRoute(context.brainRoute, {
    message,
    classification,
    plan,
    brainContext: context.brainContext,
    brainChat: context.brainChat,
  });
  plan = enforceBrainSkillWritePermission(message, plan, context.brainSkill, context.brainRoute);

  const contractValidation = validatePlannerPlanAgainstTurnContract({
    plan,
    message,
    turn: context,
    brainRoute: context.brainRoute,
    brainSkill: context.brainSkill,
    negativeWriteIntent,
  });
  addBrainTraceStep(context.brainTrace, 'planner_plan_validated', validationTrace(contractValidation));
  if (contractValidation.repaired) {
    addBrainTraceStep(context.brainTrace, 'planner_plan_repaired', validationTrace(contractValidation));
  }
  if (contractValidation.writeBlocked) {
    addBrainTraceStep(context.brainTrace, 'planner_write_blocked_by_contract', validationTrace(contractValidation));
  }
  plan = contractValidation.plan;

  const actions = [];
  let lifeosContext = null;
  let answer = '';
  const workoutAdviceOnly = isWorkoutAdviceOnlyRequest(message);
  const dayScheduleRequest = !negativeWriteIntent && !workoutAdviceOnly && context.brainRoute.mode === 'explicit_action' && context.brainRoute.write_intent && isDaySchedulePlannerGuard(message, plan);
  const explicitMultiEventRequest = !negativeWriteIntent && !workoutAdviceOnly && context.brainRoute.mode === 'explicit_action' && context.brainRoute.write_intent && isExplicitMultiEventCalendarRequest(message, plan);

  if (plan.intent === 'clarify') {
    answer = getSafeClarificationQuestion({ message, plan, brainRoute: context.brainRoute, brainSkill: context.brainSkill, negative: negativeWriteIntent });
    addBrainTraceStep(context.brainTrace, 'planner_read_only_answered', {
      reason: 'clarification',
      action_count: 0,
    });
    return completePlannerStage(context, { answer, plan, actions });
  }

  if (dayScheduleRequest || explicitMultiEventRequest) {
    const execute = dayScheduleRequest ? executeDaySchedulePlan : executeExplicitCalendarPlan;
    const writePath = dayScheduleRequest ? 'day_schedule_events' : 'explicit_calendar_events';
    try {
      const writeResult = await execute(message, plan);
      actions.push(...(writeResult.actions ?? []));
      answer = writeResult.answer;
      addBrainTraceStep(context.brainTrace, 'planner_action_executed', {
        action_type: plan.intent,
        action_count: actions.length,
        source_path: writePath,
      });
      return completePlannerStage(context, { answer, plan, actions, contextSummary: lifeosContext });
    } catch (error) {
      await handlePlannerWriteError({
        error,
        context,
        message,
        source,
        plan,
        writePath,
        friendly: dayScheduleRequest,
        friendlyDayScheduleError,
        logAiWriteFailure,
        safeLogAiError,
        attachDebugDiagnostics,
      });
    }
  }

  if (plan.needsRead || ['analyze', 'analyze_and_plan', 'blocked_destructive'].includes(plan.intent)) {
    lifeosContext = await readLifeOSContext(plan);
  }

  if (plan.intent === 'blocked_destructive') {
    answer = await answerWithAI(message, plan, lifeosContext, [
      { type: 'blocked_destructive', message: 'Deletion and destructive updates are not enabled for the AI assistant yet.' },
    ], context.brainContext, context.brainChat, context.brainSkill, context.brainRoute, context.brainVault);
    addBrainTraceStep(context.brainTrace, 'planner_read_only_answered', {
      reason: 'blocked_destructive',
      action_count: 1,
    });
    return completePlannerStage(context, { answer, plan, actions: [{ type: 'blocked_destructive' }], contextSummary: lifeosContext });
  }

  if (plan.intent === 'unsupported') {
    addBrainTraceStep(context.brainTrace, 'planner_read_only_answered', {
      reason: 'unsupported',
      action_count: 0,
    });
    return completePlannerStage(context, {
      answer: 'I cannot do that in this version of the LifeOS assistant.',
      plan,
      actions,
      contextSummary: lifeosContext,
    });
  }

  if (plan.needsWrite) {
    const finalWriteCheck = validatePlannerPlanAgainstTurnContract({
      plan,
      message,
      turn: context,
      brainRoute: context.brainRoute,
      brainSkill: context.brainSkill,
      negativeWriteIntent,
    });
    if (finalWriteCheck.writeBlocked) {
      addBrainTraceStep(context.brainTrace, 'planner_write_blocked_by_contract', validationTrace(finalWriteCheck));
      return answerBlockedPlannerWrite({
        context,
        message,
        plan: finalWriteCheck.plan,
        negativeWriteIntent,
        getSafeClarificationQuestion,
        createClarificationBrainPlan,
        createReadOnlyBrainPlan,
        answerWithAI,
      });
    }
    let writeResult;
    try {
      writeResult = await executeWriteIntent(plan, message, lifeosContext, context.brainContext, context.brainChat, context.brainSkill, context.brainRoute);
    } catch (error) {
      await handlePlannerWriteError({
        error,
        context,
        message,
        source,
        plan,
        writePath: plan.intent,
        logAiWriteFailure,
        safeLogAiError,
        attachDebugDiagnostics,
      });
    }
    actions.push(...(writeResult.actions ?? []));
    if (writeResult.context) lifeosContext = writeResult.context;
    if (writeResult.answer) answer = writeResult.answer;
    addBrainTraceStep(context.brainTrace, 'planner_action_executed', {
      action_type: plan.intent,
      action_count: actions.length,
    });
  }

  if (!answer) {
    answer = await answerWithAI(message, plan, lifeosContext, actions, context.brainContext, context.brainChat, context.brainSkill, context.brainRoute, context.brainVault);
  }
  if (workoutAdviceOnly) {
    answer = appendWorkoutReadOnlyConfirmation(answer, message);
  }

  addBrainTraceStep(context.brainTrace, 'planner_read_only_answered', {
    reason: plan.needsWrite ? 'write_result_answered' : 'read_only_answer',
    action_count: actions.length,
  });
  return completePlannerStage(context, { answer, plan, actions, contextSummary: lifeosContext });
}

export function validatePlannerPlanAgainstTurnContract({
  plan = {},
  message = '',
  turn = null,
  brainRoute = turn?.brainRoute,
  brainSkill = turn?.brainSkill,
  negativeWriteIntent = false,
} = {}) {
  const normalizedPlan = normalizePlannerPlanForContract(plan);
  const contract = turn?.brainTurnContract ?? null;
  const writeAttempt = isPlannerWritePlan(normalizedPlan);
  const reasons = [];
  let writeBlocked = false;

  if (writeAttempt) {
    const destructive = isUnsafePlannerWrite(normalizedPlan);
    if (negativeWriteIntent) {
      writeBlocked = true;
      reasons.push('negative_write_intent');
    }
    if (contract?.source_of_write_intent === 'none') {
      writeBlocked = true;
      reasons.push('contract_has_no_write_intent_source');
    }
    if (contract?.winning_path && READ_ONLY_CONTRACT_PATHS.has(contract.winning_path)) {
      writeBlocked = true;
      reasons.push(`contract_path_${contract.winning_path}_is_read_only`);
    }
    if (contract?.source_of_write_intent && contract.source_of_write_intent !== 'current_message') {
      writeBlocked = true;
      reasons.push(`contract_write_source_${contract.source_of_write_intent}_cannot_use_planner`);
    }
    if (brainRoute && (brainRoute.mode !== 'explicit_action' || !brainRoute.write_intent)) {
      writeBlocked = true;
      reasons.push('brain_route_is_not_write_intent');
    }
    if (destructive) {
      writeBlocked = true;
      reasons.push('destructive_or_unsupported_write');
    }
    const permission = canExecuteBrainAction({
      route: brainRoute,
      skill: brainSkill?.skill ?? brainSkill,
      plan: normalizedPlan,
      message,
    });
    if (!permission.allowed) {
      writeBlocked = true;
      reasons.push(`skill_or_route_permission:${permission.reason || 'not_allowed'}`);
    }
  }

  if (!writeAttempt || !writeBlocked) {
    return {
      ok: true,
      plan: normalizedPlan,
      writeAttempt,
      writeBlocked: false,
      repaired: false,
      reasons,
    };
  }

  return {
    ok: true,
    plan: repairPlannerPlanForReadOnlyContract(normalizedPlan, { brainRoute, contract, negativeWriteIntent, reasons }),
    writeAttempt,
    writeBlocked: true,
    repaired: true,
    reasons,
  };
}

export function repairPlannerPlanForReadOnlyContract(plan = {}, { brainRoute = null, contract = null, negativeWriteIntent = false, reasons = [] } = {}) {
  const shouldAnalyze = Boolean(
    plan.needsRead
    || plan.intent === 'analyze'
    || plan.intent === 'analyze_and_plan'
    || brainRoute?.mode === 'read_only_analysis'
    || contract?.winning_path === 'read_only_query'
  );
  return {
    ...plan,
    intent: shouldAnalyze ? 'analyze' : 'clarify',
    needsRead: shouldAnalyze,
    needsWrite: false,
    args: {},
    clarifyingQuestion: shouldAnalyze ? null : (negativeWriteIntent
      ? "Understood - I won't create anything. We can just talk it through."
      : plan.clarifyingQuestion || brainRoute?.clarification_question || 'What exact details should I use?'),
    riskLevel: 'low',
    reason: [
      plan.reason,
      `Planner write blocked by BrainTurn Contract: ${reasons.join(', ') || 'write_not_allowed'}.`,
    ].filter(Boolean).join(' '),
  };
}

function buildSyntheticPlannerAction({
  message,
  context,
  negativeWriteIntent,
  isFiniteRecurringCalendarRequest,
  createFiniteRecurringCalendarSyntheticPlan,
  executeFiniteRecurringCalendarPlan,
  isObviousDayScheduleRequest,
  createDayScheduleSyntheticPlan,
  executeDaySchedulePlan,
  isObviousExplicitMultiEventCalendarRequest,
  createExplicitCalendarSyntheticPlan,
  executeExplicitCalendarPlan,
}) {
  if (negativeWriteIntent || context.brainRoute?.mode !== 'explicit_action' || !context.brainRoute?.write_intent) return null;
  if (isFiniteRecurringCalendarRequest(message)) {
    return {
      name: 'finite_recurring_calendar_events',
      errorPath: 'finite_recurring_calendar_events',
      plan: createFiniteRecurringCalendarSyntheticPlan(),
      execute: executeFiniteRecurringCalendarPlan,
    };
  }
  if (isObviousDayScheduleRequest(message)) {
    return {
      name: 'day_schedule_events_preplanner',
      errorPath: 'day_schedule_events_preplanner',
      plan: createDayScheduleSyntheticPlan(message),
      execute: executeDaySchedulePlan,
      friendlyError: true,
    };
  }
  if (isObviousExplicitMultiEventCalendarRequest(message)) {
    return {
      name: 'explicit_calendar_events_preplanner',
      errorPath: 'explicit_calendar_events_preplanner',
      plan: createExplicitCalendarSyntheticPlan(message),
      execute: executeExplicitCalendarPlan,
    };
  }
  return null;
}

async function answerBlockedPlannerWrite({
  context,
  message,
  plan,
  negativeWriteIntent,
  getSafeClarificationQuestion,
  createClarificationBrainPlan,
  answerWithAI,
} = {}) {
  if (plan.intent === 'clarify') {
    const answer = getSafeClarificationQuestion({
      message,
      plan,
      brainRoute: context.brainRoute,
      brainSkill: context.brainSkill,
      negative: negativeWriteIntent,
    });
    addBrainTraceStep(context.brainTrace, 'planner_read_only_answered', {
      reason: 'write_blocked_clarification',
      action_count: 0,
    });
    return completePlannerStage(context, {
      answer,
      plan: createClarificationBrainPlan({ ...context.brainRoute, clarification_question: answer, reason: plan.reason }),
      actions: [],
      contextSummary: null,
      skipMemoryExtraction: true,
    });
  }
  const answer = await answerWithAI(message, plan, null, [], context.brainContext, context.brainChat, context.brainSkill, context.brainRoute, context.brainVault);
  addBrainTraceStep(context.brainTrace, 'planner_read_only_answered', {
    reason: 'write_blocked_read_only_answer',
    action_count: 0,
  });
  return completePlannerStage(context, {
    answer,
    plan,
    actions: [],
    contextSummary: null,
  });
}

async function handlePlannerWriteError({
  error,
  context,
  message,
  source,
  plan,
  writePath,
  friendly = false,
  friendlyDayScheduleError,
  logAiWriteFailure,
  safeLogAiError,
  attachDebugDiagnostics,
}) {
  const diagnostics = logAiWriteFailure({ context, message, plan, writePath, error });
  await safeLogAiError({ context, message, source, plan, writePath, error, diagnostics });
  const finalError = friendly && typeof friendlyDayScheduleError === 'function'
    ? friendlyDayScheduleError(error)
    : error;
  attachDebugDiagnostics(finalError, diagnostics);
  throw finalError;
}

function completePlannerStage(context, result = {}) {
  addBrainTraceStep(context.brainTrace, 'planner_stage_completed', {
    intent: result.plan?.intent ?? null,
    needs_write: Boolean(result.plan?.needsWrite),
    action_count: result.actions?.length ?? 0,
    answer_preview: safePreview(result.answer, 120),
  });
  return result;
}

function validationTrace(validation) {
  return sanitizeTraceValue({
    write_attempt: validation.writeAttempt,
    write_blocked: validation.writeBlocked,
    repaired: validation.repaired,
    reasons: validation.reasons,
    final_intent: validation.plan?.intent,
    needs_write: validation.plan?.needsWrite,
    needs_read: validation.plan?.needsRead,
  });
}

function summarizePlannerPlan(plan = {}) {
  return sanitizeTraceValue({
    intent: plan.intent,
    needs_read: Boolean(plan.needsRead),
    needs_write: Boolean(plan.needsWrite),
    range: plan.range ?? null,
    tables: Array.isArray(plan.tables) ? plan.tables.slice(0, 10) : [],
    risk_level: plan.riskLevel ?? null,
    reason: safePreview(plan.reason, 180),
  });
}

function normalizePlannerPlanForContract(plan = {}) {
  return {
    ...plan,
    needsRead: Boolean(plan.needsRead),
    needsWrite: Boolean(plan.needsWrite),
    intent: plan.intent || 'analyze',
    tables: Array.isArray(plan.tables) ? plan.tables : [],
    args: plan.args && typeof plan.args === 'object' ? plan.args : {},
    riskLevel: plan.riskLevel || 'low',
  };
}

function isPlannerWritePlan(plan = {}) {
  return Boolean(plan.needsWrite) || WRITE_INTENTS.has(plan.intent);
}

function isUnsafePlannerWrite(plan = {}) {
  const intent = String(plan.intent ?? '').toLowerCase();
  return plan.riskLevel === 'high'
    || UNSAFE_WRITE_INTENTS.has(intent)
    || /^(?:delete|remove|archive|wipe|destroy)/.test(intent);
}
