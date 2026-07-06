import {
  commandDraftToPendingAction,
  commandDraftToPlannerPlan,
  extractBrainCommandDraftWithAI,
  formatCommandDraftClarification,
  shouldUseCommandDraft,
  validateBrainCommandDraft,
} from './brainCommandDraft.js';
import { getBrainSkill } from './brainSkills.js';
import { canExecuteBrainAction } from './brainRouter.js';
import { addBrainTraceStep, safePreview, sanitizeTraceValue } from './brainTrace.js';

export async function runBrainCommandDraftStage({
  turn,
  message = turn?.message,
  classification = null,
  source = turn?.source,
  createReadOnlyBrainPlan,
  createClarificationBrainPlan,
  getSafeClarificationQuestion,
  executeCommandDraftAction,
} = {}) {
  const context = turn;
  if (!context) return null;
  if (!shouldRunCommandDraftStage({ message, context, classification })) {
    addBrainTraceStep(context?.brainTrace, 'command_draft_skipped', {
      route: context?.brainRoute?.mode,
      skill: context?.brainSkill?.skill?.id || context?.brainSkill?.id,
      contract_path: context?.brainTurnContract?.winning_path,
      contract_intent: context?.brainTurnContract?.intent_type,
    });
    return null;
  }

  let commandDraft;
  try {
    addBrainTraceStep(context?.brainTrace, 'command_draft_extraction_started', {
      route: context?.brainRoute?.mode,
      skill: context?.brainSkill?.skill?.id || context?.brainSkill?.id,
      contract_path: context?.brainTurnContract?.winning_path,
      field_policy: context?.brainTurnContract?.field_policy ?? null,
    });
    commandDraft = await extractBrainCommandDraftWithAI({
      message,
      brainRoute: context.brainRoute,
      brainSkill: context.brainSkill,
      workingContext: context.workingContext,
      lifeosContext: null,
      turnContract: context.brainTurnContract,
    });
  } catch (error) {
    console.error('[LifeOS Brain command draft warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'command_draft_extraction',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    addBrainTraceStep(context?.brainTrace, 'command_draft_extraction_failed', {
      error_code: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    });
    return null;
  }

  const validation = validateBrainCommandDraft(commandDraft, {
    workingContext: context.workingContext,
    brainRoute: context.brainRoute,
    brainSkill: context.brainSkill,
    sourceMessage: message,
    turnContract: context.brainTurnContract,
  });
  if (!validation?.ok || !validation.draft) return null;
  const draft = validation.draft;
  context.commandDraft = draft;
  context.brainTrace.command_draft = summarizeCommandDraftForTrace(draft, validation);
  addBrainTraceStep(context?.brainTrace, 'command_draft_validated', context.brainTrace.command_draft);

  if (validation.cancelled) {
    addBrainTraceStep(context?.brainTrace, 'command_draft_cancelled', { mode: draft.mode });
    const answer = draft.language === 'it' ? 'Ricevuto. Non ho creato nulla.' : 'Got it. I did not create anything.';
    return {
      answer,
      plan: createReadOnlyBrainPlan('Command draft cancelled by current user message.'),
      actions: [],
      contextSummary: null,
      skipMemoryExtraction: true,
    };
  }

  if (draft.mode === 'unsupported') {
    addBrainTraceStep(context?.brainTrace, 'command_draft_unsupported', { reason: draft.reason });
    const answer = draft.language === 'it'
      ? 'Non posso farlo direttamente in questa versione. Posso creare un nuovo evento o promemoria collegato, se vuoi.'
      : 'I cannot do that directly in this version. I can create a related event or reminder if you want.';
    return {
      answer,
      plan: createReadOnlyBrainPlan(draft.reason || 'Command draft unsupported.'),
      actions: [],
      contextSummary: null,
      skipMemoryExtraction: true,
    };
  }

  if (draft.mode === 'clarify' || !validation.executable || draft.action?.confirmation_required) {
    const pendingAction = commandDraftToPendingAction(draft, {
      ...context,
      message,
      workingContext: context.workingContext,
      brainTurnContract: context.brainTurnContract,
    });
    if (pendingAction && draft.action?.type && draft.mode !== 'unsupported') {
      context.pendingActionForResponse = pendingAction;
      context.brainTrace.pending_action = {
        found: true,
        id: pendingAction.id,
        type: pendingAction.action_type,
        status: pendingAction.status,
        missing_fields: pendingAction.missing_fields,
      };
    }
    const clarification = formatCommandDraftClarification(draft, context.workingContext);
    addBrainTraceStep(context?.brainTrace, 'command_draft_clarification', {
      executable: Boolean(validation.executable),
      confirmation_required: Boolean(draft.action?.confirmation_required),
      pending_action: context.brainTrace.pending_action,
      clarification_question: safePreview(clarification, 180),
    });
    return {
      answer: clarification,
      plan: createClarificationBrainPlan({
        ...context.brainRoute,
        clarification_question: clarification,
        reason: draft.reason || 'Command draft needs clarification.',
      }),
      actions: [],
      contextSummary: null,
      ...(pendingAction ? { pending_action: pendingAction } : {}),
      skipMemoryExtraction: true,
    };
  }

  if (draft.mode !== 'action') return null;

  const plan = commandDraftToPlannerPlan(draft);
  const skill = getBrainSkill(skillIdForCommandDraftAction(plan.intent));
  const route = {
    mode: 'explicit_action',
    primary_skill: skill.id,
    write_intent: true,
    proposed_action_types: [plan.intent],
    risk_level: plan.riskLevel || 'low',
  };
  const permission = canExecuteBrainAction({ route, skill, plan, message });
  if (!permission.allowed) {
    addBrainTraceStep(context?.brainTrace, 'command_draft_blocked', {
      reason: permission.reason,
      action_type: plan.intent,
    });
    const answer = getSafeClarificationQuestion({ message, plan, brainRoute: route, brainSkill: { skill } });
    return {
      answer,
      plan: createClarificationBrainPlan({ ...route, clarification_question: answer }),
      actions: [],
      contextSummary: null,
      skipMemoryExtraction: true,
    };
  }

  const writeResult = await executeCommandDraftAction({ draft, plan, route, skill, message, context, source });
  addBrainTraceStep(context?.brainTrace, 'command_draft_executed', {
    action_type: plan.intent,
    action_count: writeResult.actions?.length ?? 0,
  });
  return {
    answer: writeResult.answer,
    plan,
    actions: writeResult.actions ?? [],
    contextSummary: null,
    skipMemoryExtraction: true,
  };
}

export function summarizeCommandDraftForTrace(draft, validation = {}) {
  const args = draft?.action?.args && typeof draft.action.args === 'object' ? draft.action.args : {};
  return sanitizeTraceValue({
    mode: draft?.mode,
    type: draft?.action?.type ?? null,
    confidence: draft?.confidence ?? null,
    missing_fields: validation?.missing_fields ?? draft?.action?.missing_fields ?? [],
    executable: Boolean(validation?.executable),
    confirmation_required: Boolean(draft?.action?.confirmation_required),
    referent: draft?.referent ? {
      needed: Boolean(draft.referent.needed),
      resolved: Boolean(draft.referent.resolved),
      source: draft.referent.source,
      confidence: draft.referent.confidence,
    } : null,
    field_provenance: draft?.field_provenance ?? null,
    args_summary: summarizeArgsForTrace(args),
  });
}

function shouldRunCommandDraftStage({ message, context, classification }) {
  const contract = context?.brainTurnContract;
  if (contract?.winning_path && !['explicit_command', 'clarification'].includes(contract.winning_path)) return false;
  if (contract?.intent_type && ['agenda_query', 'operational_follow_up', 'true_memory_recall', 'proactive_reply'].includes(contract.intent_type)) return false;
  return shouldUseCommandDraft({
    message,
    brainRoute: context.brainRoute,
    brainSkill: context.brainSkill,
    workingContext: context.workingContext,
    classification,
  });
}

function summarizeArgsForTrace(args) {
  if (!args || typeof args !== 'object') return {};
  const output = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      output[key] = safePreview(String(value), 80);
    } else if (Array.isArray(value)) {
      output[key] = { type: 'array', count: value.length };
    } else if (typeof value === 'object') {
      output[key] = { type: 'object', keys: Object.keys(value).slice(0, 8) };
    }
  }
  return sanitizeTraceValue(output);
}

function skillIdForCommandDraftAction(actionType) {
  if (actionType === 'create_expense') return 'finance_analyst';
  if (actionType === 'create_calendar_event' || actionType === 'create_calendar_events') return 'calendar_planner';
  if (actionType === 'create_memo') return 'memo_assistant';
  if (actionType === 'update_health_log' || actionType === 'log_sleep_start') return 'health_coach';
  return 'general_chat';
}
