import { HttpError } from '../http.js';
import { addBrainTraceStep } from '../brainTrace.js';
import {
  buildPendingActionFromCandidate,
  extractPendingActionCandidateWithAI,
  formatPendingActionCompletedAnswer,
  formatPendingActionQuestion,
  markPendingActionCompleted,
  validatePendingActionCandidate,
} from '../brainPendingActions.js';
import { canExecuteBrainAction } from '../brainRouter.js';
import { closeBrainInteraction } from '../brainWhatsappReliability.js';
import {
  createClarificationBrainPlan,
  createReadOnlyBrainPlan,
  getSafeClarificationQuestion,
  hasNegativeWriteIntent,
} from './chatClassification.js';
import { executeWriteIntent } from './chatCalendarPlanning.js';
import { getActionUserId, getSupabaseAdmin } from '../supabaseAdmin.js';
import { getBrainSkill } from '../brainSkills.js';
import { localDate, resolveDate, updateHealthLog } from '../lifeosTools.js';
import { logSleepStart } from '../healthActions.js';
import { runBrainCommandDraftStage } from '../brainCommandDraftStage.js';
import { runCompanionProactiveTurn } from '../brainCompanionTurn.js';

export function formatQuotedTargetClarification(intent, language) {
  const english = language !== 'it';
  const messages = {
    quoted_provider_id_not_found: english
      ? 'I cannot find that quoted LifeOS message. Tell me which health item you want to update.'
      : 'Non trovo quel messaggio LifeOS citato. Dimmi quale dato salute vuoi aggiornare.',
    quoted_target_scope_mismatch: english
      ? 'That quoted message belongs to another WhatsApp conversation, so I did not change anything.'
      : 'Quel messaggio citato appartiene a un altra conversazione WhatsApp. Non modifico nulla.',
    quoted_target_thread_mismatch: english
      ? 'That quoted message belongs to another LifeOS thread, so I did not change anything.'
      : 'Quel messaggio citato appartiene a un altro thread LifeOS. Non modifico nulla.',
    quoted_target_not_replyable: english
      ? 'That quoted LifeOS message is not a replyable check-in.'
      : 'Quel messaggio LifeOS citato non e un check-in a cui posso applicare una risposta.',
    quoted_target_resolved: english
      ? 'That check-in is already resolved. Nothing changed.'
      : 'Quel check-in e gia risolto. Non modifico nulla.',
    quoted_target_expired: english
      ? 'That check-in has expired. Tell me which health item you want to update.'
      : 'Quel check-in e scaduto. Dimmi quale dato salute vuoi aggiornare.',
    quoted_reply_invalid: english
      ? 'I found the quoted reminder, but I need a clearer answer.'
      : 'Ho trovato il promemoria citato, ma mi serve una risposta piu precisa.',
  };
  return messages[intent] || (english
    ? 'I cannot use that quoted LifeOS message. Tell me which item you want to update.'
    : 'Non posso usare quel messaggio LifeOS citato. Dimmi quale dato vuoi aggiornare.');
}

export async function handlePendingActionResolution({ resolution, context, message, source }) {
  const pendingAction = resolution.pending_action;
  if (resolution.type === 'cancelled') {
    await closeBrainInteraction({
      threadId: context.thread?.id,
      assistantMessageId: context.activeInteraction?.assistant_message_id,
      expectedVersion: context.activeInteraction?.version,
      state: 'answered',
    });
    context.pendingActionForResponse = pendingAction;
    return {
      answer: resolution.answer,
      plan: createPendingActionPlan(pendingAction, { clarify: true, reason: 'Pending action cancelled by user.' }),
      actions: [],
      contextSummary: null,
      pending_action: pendingAction,
      skipMemoryExtraction: true,
    };
  }

  if (resolution.type === 'ask') {
    context.pendingActionForResponse = pendingAction;
    return {
      answer: resolution.answer || formatPendingActionQuestion(pendingAction),
      plan: createPendingActionPlan(pendingAction, { clarify: true, reason: 'Pending action needs confirmation or missing fields.' }),
      actions: [],
      contextSummary: null,
      pending_action: pendingAction,
      skipMemoryExtraction: true,
    };
  }

  if (resolution.type === 'execute') {
    const writeResult = await executePendingAction(pendingAction, { message, context, source });
    const completed = markPendingActionCompleted(pendingAction);
    context.pendingActionForResponse = completed;
    await closeBrainInteraction({
      threadId: context.thread?.id,
      assistantMessageId: context.activeInteraction?.assistant_message_id,
      expectedVersion: context.activeInteraction?.version,
      state: 'answered',
    });
    return {
      answer: writeResult.answer || formatPendingActionCompletedAnswer(writeResult.actions?.[0], pendingAction),
      plan: createPendingActionPlan(pendingAction, { reason: 'Confirmed pending action executed.' }),
      actions: writeResult.actions ?? [],
      contextSummary: null,
      pending_action: completed,
      skipMemoryExtraction: true,
    };
  }

  return {
    answer: 'What exact details should I use?',
    plan: createPendingActionPlan(pendingAction, { clarify: true, reason: 'Pending action could not be resolved.' }),
    actions: [],
    contextSummary: null,
    skipMemoryExtraction: true,
  };
}

export async function maybeResolveProactiveWhatsappReply({ message, resolvedSource, context }) {
  if (resolvedSource !== 'whatsapp') return null;
  const companionTurn = await runCompanionProactiveTurn({
    message,
    brainChat: context.brainChat,
    context,
    selection: context.interactionSelection?.proactive_selection ?? null,
  });
  const proactiveResult = companionTurn?.result ?? null;
  const trace = proactiveResult?.proactive_reply_trace ?? {};
  const traceData = {
    proactive_reply_checked: true,
    proactive_reply_handled: Boolean(proactiveResult),
    proactive_reply_reason: trace.reason ?? proactiveResult?.plan?.reasoning ?? null,
    proactive_reply_action_type: trace.action_type ?? proactiveResult?.actions?.[0]?.type ?? null,
    proactive_reply_ambiguous: Boolean(trace.ambiguous),
    proactive_reply_stale: Boolean(trace.stale),
    companion_turn: Boolean(trace.companion),
    companion_semantic: trace.semantic ?? null,
    companion_belief_updated: Boolean(trace.belief_updated),
    companion_negative_feedback_recorded: Boolean(trace.negative_feedback_recorded),
    companion_residual_preserved: Boolean(trace.residual_preserved),
  };
  context.brainTrace.proactive_reply = traceData;
  addBrainTraceStep(context.brainTrace, 'proactive_reply_checked', traceData);
  if (!proactiveResult) return null;
  await closeBrainInteraction({
    threadId: context.thread?.id,
    assistantMessageId: context.interactionSelection?.assistant_message_id ?? null,
    expectedVersion: context.interactionSelection?.interaction_version,
    state: proactiveResult?.plan?.intent === 'clarify' ? 'abandoned' : 'answered',
  });
  const { proactive_reply_trace: _internalTrace, ...publicResult } = proactiveResult;
  return publicResult;
}

export async function maybeCreatePendingActionCandidate({ message, context, classification }) {
  if (!shouldAttemptPendingActionCandidate({ message, context, classification })) {
    addBrainTraceStep(context?.brainTrace, 'pending_candidate_skipped', {
      route: context?.brainRoute?.mode,
      skill: context?.brainSkill?.skill?.id || context?.brainSkill?.id,
    });
    return null;
  }
  addBrainTraceStep(context?.brainTrace, 'pending_candidate_extraction_started', {
    route: context?.brainRoute?.mode,
    skill: context?.brainSkill?.skill?.id || context?.brainSkill?.id,
  });
  let validation;
  try {
    validation = await extractPendingActionCandidateWithAI({
      message,
      context,
      brainSkill: context.brainSkill,
      brainRoute: context.brainRoute,
    });
  } catch (error) {
    console.error('[LifeOS Brain pending action warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'pending_action_extraction',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    addBrainTraceStep(context?.brainTrace, 'pending_candidate_extraction_failed', {
      error_code: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    });
    return null;
  }
  addBrainTraceStep(context?.brainTrace, 'pending_candidate_validated', {
    ok: Boolean(validation?.ok),
    action_type: validation?.candidate?.action_type,
    executable: Boolean(validation?.executable),
    missing_fields: validation?.missing_fields,
  });
  if (!validation?.ok || !validation.candidate) return null;
  const candidate = validation.candidate;
  if (validation.executable && !candidate.confirmation_required) return null;
  const pendingAction = buildPendingActionFromCandidate({
    candidate,
    message,
    context,
  });
  if (!pendingAction) return null;
  context.pendingActionForResponse = pendingAction;
  context.brainTrace.pending_action = {
    found: true,
    id: pendingAction.id,
    type: pendingAction.action_type,
    status: pendingAction.status,
    missing_fields: pendingAction.missing_fields,
  };
  addBrainTraceStep(context?.brainTrace, 'pending_candidate_stored', context.brainTrace.pending_action);
  return {
    answer: formatPendingActionQuestion(pendingAction),
    plan: createPendingActionPlan(pendingAction, { clarify: true, reason: 'Stored pending action candidate.' }),
    actions: [],
    contextSummary: null,
    pending_action: pendingAction,
    skipMemoryExtraction: true,
  };
}

export async function maybeHandleCommandDraft({ message, context, classification, source }) {
  return runBrainCommandDraftStage({
    turn: context,
    message,
    classification,
    source,
    createReadOnlyBrainPlan,
    createClarificationBrainPlan,
    getSafeClarificationQuestion,
    executeCommandDraftAction,
  });
}
async function executeCommandDraftAction({ draft, plan, route, skill, message, context }) {
  if (plan.intent === 'log_sleep_start') {
    const result = await logSleepStart({
      time: plan.args?.time ?? plan.args?.sleep_start ?? plan.args?.sleepStart,
      loggedOn: plan.args?.logged_on || plan.args?.date ? resolveDate(plan.args.logged_on ?? plan.args.date, undefined) : undefined,
      notes: plan.args?.notes,
    });
    return {
      actions: [{
        type: 'log_sleep_start',
        data: {
          ...result,
          command_draft_id: context?.requestId,
          sourcePath: 'command_draft',
        },
      }],
      answer: formatCommandDraftSuccess({ draft, action: { type: 'log_sleep_start', data: result } }),
    };
  }

  if (plan.intent === 'update_health_log' && plan.args?.health_note_append) {
    const pendingShape = {
      id: context?.requestId,
      action_type: 'update_health_log',
      language: draft.language,
      summary: draft.intent_summary,
      args: plan.args,
    };
    const updated = await executePendingHealthUpdate(pendingShape);
    return {
      actions: [{
        type: 'update_health_log',
        data: {
          ...updated,
          command_draft_id: context?.requestId,
          sourcePath: 'command_draft',
        },
      }],
      answer: formatCommandDraftSuccess({ draft, action: { type: 'update_health_log', data: updated } }),
    };
  }
  const writeResult = await executeWriteIntent(plan, message, null, context.brainContext, context.brainChat, { skill }, route);
  const mappedActions = (writeResult.actions ?? []).map((item) => ({
    ...item,
    data: {
      ...(item.data && typeof item.data === 'object' ? item.data : {}),
      command_draft_id: context?.requestId,
      sourcePath: item.data?.sourcePath || 'command_draft',
    },
  }));
  return {
    ...writeResult,
    actions: mappedActions,
    answer: formatCommandDraftSuccess({ draft, action: mappedActions[0] }),
  };
}

function formatCommandDraftSuccess({ draft, action }) {
  const language = draft?.language === 'it' ? 'it' : 'en';
  const data = action?.data ?? {};
  if (draft?.action?.type === 'create_calendar_event') {
    const title = data.title || draft.action.args?.title || draft.intent_summary;
    const date = data.event_date || draft.action.args?.event_date;
    const start = data.start_time || draft.action.args?.start_time;
    const end = data.end_time || draft.action.args?.end_time;
    return language === 'it'
      ? `Aggiunto al calendario: ${title}${date ? `, ${date}` : ''}${start ? ` ${start}${end ? `-${end}` : ''}` : ''}.`
      : `Added to calendar: ${title}${date ? `, ${date}` : ''}${start ? ` ${start}${end ? `-${end}` : ''}` : ''}.`;
  }
  if (draft?.action?.type === 'create_memo') {
    const title = data.title || draft.action.args?.title || draft.intent_summary;
    return language === 'it' ? `Creato promemoria: ${title}.` : `Created reminder: ${title}.`;
  }
  if (draft?.action?.type === 'update_health_log') {
    const detail = draft.action.args?.health_note_append || draft.intent_summary;
    return language === 'it' ? `Salvato nella salute: ${detail}.` : `Saved to Health: ${detail}.`;
  }
  if (draft?.action?.type === 'log_sleep_start') {
    const time = data.sleep_start || draft.action.args?.time || draft.action.args?.sleep_start;
    return language === 'it' ? `Salvato: inizio sonno alle ${time}.` : `Saved: sleep start at ${time}.`;
  }
  return language === 'it' ? 'Fatto.' : 'Done.';
}

function shouldAttemptPendingActionCandidate({ message, context, classification }) {
  if (!message || hasNegativeWriteIntent(message)) return false;
  if (classification?.kind && ['memory_write', 'memory_recall', 'memory_forget', 'follow_up_transform', 'read_only_analysis'].includes(classification.kind)) return false;
  const mode = context?.brainRoute?.mode;
  if (['memory_write', 'memory_recall', 'memory_forget', 'follow_up_transform', 'read_only_analysis'].includes(mode)) return false;
  const skillId = context?.brainSkill?.skill?.id || context?.brainRoute?.primary_skill;
  if (['health_coach', 'calendar_planner', 'memo_assistant', 'finance_analyst', 'project_ops_coach'].includes(skillId)) return true;
  return mode === 'clarification' || mode === 'explicit_action';
}

async function executePendingAction(pendingAction, { message, context }) {
  const validation = validatePendingActionCandidate(pendingAction, context);
  if (!validation?.ok || !validation.executable) {
    throw new HttpError(400, validation?.question || 'Pending action is missing required details.');
  }
  const action = validation.candidate;
  const plan = createPendingActionPlan(action);
  const skill = getBrainSkill(action.skill || skillIdForPendingAction(action.action_type));
  const route = {
    mode: 'explicit_action',
    primary_skill: skill.id,
    write_intent: true,
    proposed_action_types: [action.action_type],
    risk_level: action.risk_level || 'low',
  };
  const permission = canExecuteBrainAction({ route, skill, plan, message });
  if (!permission.allowed) {
    throw new HttpError(400, permission.reason || 'Pending action was not allowed.');
  }

  if (action.action_type === 'update_health_log') {
    const updated = await executePendingHealthUpdate(action);
    return {
      actions: [{
        type: 'update_health_log',
        data: {
          ...updated,
          pending_action_id: action.id,
          sourcePath: 'pending_action',
        },
      }],
      answer: formatPendingActionCompletedAnswer({ data: updated }, action),
    };
  }

  if (action.action_type === 'log_sleep_start') {
    const result = await logSleepStart({
      time: action.args?.time ?? action.args?.sleep_start ?? action.args?.sleepStart,
      loggedOn: action.args?.logged_on || action.args?.date ? resolveDate(action.args.logged_on ?? action.args.date, undefined) : undefined,
      notes: action.args?.notes,
    });
    return {
      actions: [{
        type: 'log_sleep_start',
        data: {
          ...result,
          pending_action_id: action.id,
          sourcePath: 'pending_action',
        },
      }],
      answer: formatPendingActionCompletedAnswer({ data: result }, action),
    };
  }

  const writeResult = await executeWriteIntent(plan, message, null, context.brainContext, context.brainChat, { skill }, route);
  return {
    ...writeResult,
    actions: (writeResult.actions ?? []).map((item) => ({
      ...item,
      data: {
        ...(item.data && typeof item.data === 'object' ? item.data : {}),
        pending_action_id: action.id,
        sourcePath: item.data?.sourcePath || 'pending_action',
      },
    })),
    answer: writeResult.answer || formatPendingActionCompletedAnswer(writeResult.actions?.[0], action),
  };
}

async function executePendingHealthUpdate(pendingAction) {
  const args = pendingAction.args ?? {};
  if (!args.health_note_append) return updateHealthLog(args);
  const loggedOn = resolveDate(args.logged_on ?? args.date, localDate());
  const existing = await readHealthLogForPendingDate(loggedOn);
  const existingNotes = String(existing?.notes ?? '').trim();
  const note = String(args.health_note_append ?? '').trim();
  const notes = existingNotes.includes(note)
    ? existingNotes
    : [existingNotes, note].filter(Boolean).join('\n');
  return updateHealthLog({
    logged_on: loggedOn,
    notes,
  });
}

async function readHealthLogForPendingDate(loggedOn) {
  const result = await getSupabaseAdmin()
    .from('health_logs')
    .select('id, notes')
    .eq('user_id', getActionUserId())
    .eq('logged_on', loggedOn)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ?? null;
}

function createPendingActionPlan(pendingAction, { clarify = false, reason = '' } = {}) {
  const intent = pendingAction?.action_type || 'clarify';
  return {
    intent: clarify ? 'clarify' : intent,
    needsRead: false,
    needsWrite: !clarify,
    range: null,
    tables: tableForPendingAction(intent),
    args: pendingAction?.args ?? {},
    clarifyingQuestion: clarify ? formatPendingActionQuestion(pendingAction) : null,
    riskLevel: pendingAction?.risk_level || 'low',
    reason: reason || 'Pending action resolution.',
  };
}

function tableForPendingAction(actionType) {
  if (actionType === 'update_health_log') return ['health_logs'];
  if (actionType === 'log_sleep_start') return ['health_logs'];
  if (actionType === 'create_calendar_event') return ['calendar_events'];
  if (actionType === 'create_memo') return ['memos'];
  if (actionType === 'create_expense') return ['expenses'];
  return [];
}

function skillIdForPendingAction(actionType) {
  if (actionType === 'update_health_log') return 'health_coach';
  if (actionType === 'log_sleep_start') return 'health_coach';
  if (actionType === 'create_calendar_event') return 'calendar_planner';
  if (actionType === 'create_memo') return 'memo_assistant';
  if (actionType === 'create_expense') return 'finance_analyst';
  return 'general_chat';
}
