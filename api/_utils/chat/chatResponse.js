import { AUTO_SAVE_SKILLS } from './chatShared.js';
import {
  HttpError,
  getBearerToken,
  matchesSecret,
  sendSuccess,
} from '../http.js';
import { buildSubjectFromActionResult, buildSubjectFromPendingAction, serializeWorkingContextForMetadata } from '../brainWorkingContext.js';
import { extractRecordRefs, inferActionLogType, safeLogAiSuccess } from './chatScheduleParsing.js';
import { finishBrainTrace, safePreview, sanitizeTraceValue } from '../brainTrace.js';
import { getActionUserId, getSupabaseAdmin, requireConfiguredUserAccess } from '../supabaseAdmin.js';
import { looksLikeShortOperationalReply, safeAutoSaveBrainReport } from './chatAutoVault.js';
import { proposeProjectMonitorFromTurn, retireProjectMonitorFromTurn } from '../brainMonitors.js';
import { safeExtractBrainKnowledge, safePersistBrainSuccess } from './chatPersistence.js';
import { serializeBrainRoute } from '../brainRouter.js';
import { serializeSkillSelection } from './chatClassification.js';
import { serializeVaultContextForMetadata } from '../brainVault.js';

export async function requireAssistantAuth(req) {
  const token = getBearerToken(req);
  if (!token) throw new HttpError(401, 'Unauthorized.');

  if (matchesSecret(token, process.env.LIFEOS_ACTION_TOKEN)) {
    getActionUserId();
    return { type: 'action-token' };
  }

  const user = await requireConfiguredUserAccess(token);
  return { type: 'supabase-session', user };
}

export function resolveAssistantSource(authInfo, body = {}) {
  if (authInfo?.type === 'supabase-session') return 'app';
  const requested = String(body.source ?? '').trim().toLowerCase();
  if (['shortcut', 'api'].includes(requested)) return requested;
  return 'shortcut';
}

export function normalizeAssistantSource(value) {
  const requested = String(value ?? '').trim().toLowerCase();
  if (['app', 'shortcut', 'api', 'whatsapp'].includes(requested)) return requested;
  return 'api';
}

export async function sendAiSuccess(res, status, data, context, logInfo) {
  const {
    skipMemoryExtraction = false,
    memory_extraction_message: memoryExtractionMessage = null,
    working_context: explicitWorkingContext = null,
    ...publicData
  } = data ?? {};
  const selectedSkill = publicData.selected_skill ?? serializeSkillSelection(context?.brainSkill);
  const brainRoute = publicData.brain_route ?? serializeBrainRoute(context?.brainRoute);
  const vaultContext = publicData.vault_context ?? serializeVaultContextForMetadata(context?.brainVault?.results);
  const workingContext = explicitWorkingContext && typeof explicitWorkingContext === 'object'
    ? explicitWorkingContext
    : buildResponseWorkingContext({
      context,
      answer: publicData.answer,
      plan: publicData.plan,
      actions: publicData.actions ?? [],
      message: logInfo?.message,
    });
  context.workingContextForResponse = workingContext;
  const responseData = {
    ...publicData,
    ...(selectedSkill ? { selected_skill: selectedSkill } : {}),
    ...(brainRoute ? { brain_route: brainRoute } : {}),
    ...(vaultContext?.retrieved_count ? { vault_context: vaultContext } : {}),
  };
  const traceForMetadata = finalizeBrainTraceForResponse(context, {
    answer: responseData?.answer,
    plan: responseData?.plan,
    actions: responseData?.actions ?? [],
    selectedSkill,
    brainRoute,
    vaultContext,
    workingContext,
    final_response_type: inferFinalResponseType(responseData?.plan, responseData?.actions ?? [], responseData?.answer),
  });
  await safeLogAiSuccess({
    context,
    message: logInfo?.message,
    source: logInfo?.source,
    answer: responseData?.answer,
    actions: responseData?.actions ?? [],
    selectedSkill,
    brainRoute,
    vaultContext,
  });
  const actionType = inferActionLogType(responseData?.actions ?? []);
  const recordRefs = extractRecordRefs(responseData?.actions ?? []);
  const assistantMessage = await safePersistBrainSuccess({
    context,
    answer: responseData?.answer,
    plan: responseData?.plan,
    actions: responseData?.actions ?? [],
    actionType,
    recordRefs,
    selectedSkill,
    brainRoute,
    vaultContext,
    workingContext,
    brainTrace: traceForMetadata,
  });
  let responseTrace = assistantMessage?.id
    ? { ...traceForMetadata, assistant_message_id: assistantMessage.id }
    : traceForMetadata;
  const autoSaveResult = await safeAutoSaveBrainReport({
    context,
    assistantMessage,
    answer: responseData?.answer,
    actions: responseData?.actions ?? [],
    selectedSkill,
    brainRoute,
    workingContext,
    userMessage: logInfo?.message,
  });
  responseTrace = mergeAutoSaveTraceResult(responseTrace, autoSaveResult);
  await safeUpdateBrainTraceMetadata({ context, assistantMessage, brainTrace: responseTrace });
  if (!skipMemoryExtraction) {
    await safeExtractBrainKnowledge({
      context,
      message: memoryExtractionMessage || logInfo?.message,
      answer: responseData?.answer,
      actionType,
    });
  }
  await safeMaintainBrainMonitors({ context, message: memoryExtractionMessage || logInfo?.message });
  const payload = {
    ...responseData,
    ...(context?.clientRequestId ? { client_request_id: context.clientRequestId } : {}),
    ...(context?.brainChat?.thread?.id ? {
      thread_id: context.brainChat.thread.id,
      persisted_user_message: context.brainChat.userMessage ?? null,
      persisted_message: assistantMessage,
    } : {}),
  };
  const debugPayload = maybeAttachDebug(payload, context, responseTrace);
  logBrainTraceIfEnabled(context, responseTrace);
  if (!res) return debugPayload;
  return sendSuccess(res, status, debugPayload, context);
}

export function finalizeBrainTraceForResponse(context, data = {}) {
  if (!context?.brainTrace) return null;
  const actions = Array.isArray(data.actions) ? data.actions : [];
  const selectedSkill = data.selectedSkill ?? serializeSkillSelection(context?.brainSkill);
  const brainRoute = data.brainRoute ?? serializeBrainRoute(context?.brainRoute);
  const vaultContext = data.vaultContext ?? serializeVaultContextForMetadata(context?.brainVault?.results);
  const autoSave = inferAutoSaveTrace({
    answer: data.answer,
    actions,
    selectedSkill,
    brainRoute,
  });
  const finalTrace = finishBrainTrace(context.brainTrace, {
    source: context.brainTrace.source,
    response_mode: context.brainTrace.response_mode,
    client_request_id: context.clientRequestId,
    thread_id: context.brainChat?.thread?.id ?? context.brainTrace.thread_id ?? null,
    user_message_id: context.brainChat?.userMessage?.id ?? context.brainTrace.user_message_id ?? null,
    whatsapp_sender: context.channelMetadata?.whatsapp_sender ?? context.brainTrace.whatsapp_sender ?? null,
    whatsapp_message_id: context.channelMetadata?.whatsapp_message_id ?? context.brainTrace.whatsapp_message_id ?? null,
    language: context.workingContext?.language || context.brainTrace.language || 'unknown',
    route: brainRoute?.mode ?? context.brainTrace.route ?? null,
    selected_skill: selectedSkill?.id ?? selectedSkill?.skill?.id ?? context.brainTrace.selected_skill ?? null,
    working_context: context.brainTrace.working_context ?? {
      used: Boolean(context.workingContext),
      last_subject_type: context.workingContext?.last_subject?.type ?? null,
      last_action_type: context.workingContext?.last_action_result?.action_type ?? null,
    },
    vault: context.brainTrace.vault ?? {
      attempted: Boolean(context.brainVault?.attempted),
      used: Number(context.brainVault?.results?.length ?? 0) > 0,
      chunks: context.brainVault?.results?.length ?? 0,
      documents: uniqueVaultDocumentCount(context.brainVault?.results),
    },
    tools: actionsToTraceTools(actions),
    auto_save: autoSave,
    final_response_type: data.final_response_type || inferFinalResponseType(data.plan, actions, data.answer),
    error_code: data.error_code ?? null,
    ...(context.debugFlags?.full ? { assistant_text_full: String(data.answer ?? '').slice(0, 8000) } : {}),
    assistant_text_preview: safePreview(data.answer, 200),
  });
  context.finishedBrainTrace = finalTrace;
  return finalTrace;
}

export function maybeAttachDebug(payload, context, trace = context?.finishedBrainTrace) {
  if (!context?.debugFlags?.enabled || !trace) return payload;
  return {
    ...payload,
    debug: {
      ...(payload?.debug && typeof payload.debug === 'object' ? payload.debug : {}),
      brain_trace: trace,
    },
  };
}

function mergeAutoSaveTraceResult(trace, autoSaveResult) {
  if (!trace || !autoSaveResult || !trace.auto_save) return trace;
  const reason = autoSaveResult.saved
    ? 'saved'
    : (trace.auto_save.reason === 'eligible' ? autoSaveResult.reason || 'not_saved' : trace.auto_save.reason);
  return {
    ...trace,
    auto_save: sanitizeTraceValue({
      ...trace.auto_save,
      saved: Boolean(autoSaveResult.saved),
      reason,
      document_id: autoSaveResult.document_id ?? null,
      document_type: autoSaveResult.document_type ?? null,
      error_code: autoSaveResult.error_code ?? null,
    }),
  };
}

async function safeUpdateBrainTraceMetadata({ context, assistantMessage, brainTrace }) {
  if (!assistantMessage?.id || !brainTrace) return;
  try {
    const metadata = assistantMessage.metadata && typeof assistantMessage.metadata === 'object'
      ? assistantMessage.metadata
      : {};
    const nextMetadata = {
      ...metadata,
      brain_trace: brainTrace,
    };
    const result = await getSupabaseAdmin()
      .from('ai_chat_messages')
      .update({ metadata: nextMetadata })
      .eq('id', assistantMessage.id)
      .eq('user_id', getActionUserId());
    if (result.error) throw result.error;
    assistantMessage.metadata = nextMetadata;
  } catch (error) {
    console.error('[LifeOS Brain trace persistence warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'brain_trace_update',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
  }
}

async function safeMaintainBrainMonitors({ context, message }) {
  if (!context?.brainChat || !message) return;
  try {
    const retired = await retireProjectMonitorFromTurn({ message });
    if (!retired) {
      await proposeProjectMonitorFromTurn({ message, channel: context.source === 'whatsapp' ? 'whatsapp' : 'app',
        messageId: context.brainChat.userMessage?.id });
    }
  } catch (error) {
    console.error('[LifeOS Brain monitor warning]', JSON.stringify({
      requestId: context?.requestId, stage: 'monitor_maintenance',
      error: error instanceof Error ? error.message : 'Monitor maintenance unavailable',
    }));
  }
}

export function logBrainTraceIfEnabled(context, trace = context?.finishedBrainTrace) {
  if (!context?.debugFlags?.enabled || !trace) return;
  const compact = {
    trace_id: trace.trace_id,
    source: trace.source,
    response_mode: trace.response_mode,
    client_request_id: trace.client_request_id,
    thread_id: trace.thread_id,
    whatsapp_sender: trace.whatsapp_sender,
    whatsapp_message_id: trace.whatsapp_message_id,
    route: trace.route,
    selected_skill: trace.selected_skill,
    pending_action: trace.pending_action,
    pending_reply_intent: trace.pending_reply_intent,
    pending_resolution: trace.pending_resolution,
    pending_action_bypass: trace.pending_action_bypass,
    command_draft: trace.command_draft ? {
      type: trace.command_draft.type,
      confidence: trace.command_draft.confidence,
      missing_fields: trace.command_draft.missing_fields,
    } : null,
    tools: trace.tools,
    final_response_type: trace.final_response_type,
    error_code: trace.error_code,
    latency_ms: trace.latency_ms,
  };
  console.log('BRAIN_TRACE', JSON.stringify(sanitizeTraceValue(compact)));
}

function actionsToTraceTools(actions) {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((action) => action?.type)
    .slice(0, 20)
    .map((action) => ({
      name: action.type,
      result: String(action.type).startsWith('blocked') || action.type === 'error' ? 'blocked' : 'success',
      error_code: action.error_code ?? null,
      source_path: action.data?.sourcePath ?? null,
      record_id: action.data?.id ?? action.data?.health_log?.id ?? action.data?.document?.id ?? null,
      record_date: action.data?.event_date ?? action.data?.memo_date ?? action.data?.logged_on ?? action.data?.sleep_start_logged_on ?? null,
    }));
}

function inferFinalResponseType(plan, actions, answer) {
  const intent = plan?.intent;
  if (Array.isArray(actions) && actions.some((action) => action?.type === 'error')) return 'error';
  if (Array.isArray(actions) && actions.some((action) => action?.type && !String(action.type).startsWith('blocked'))) return 'action_confirmation';
  if (intent === 'clarify' || plan?.clarifyingQuestion) return 'clarification';
  if (intent === 'analyze' || plan?.needsRead) return 'analysis';
  const text = String(answer ?? '').trim();
  if (text.length < 240) return 'casual';
  return 'analysis';
}

function inferAutoSaveTrace({ answer, actions, selectedSkill, brainRoute }) {
  const content = String(answer ?? '').trim();
  const skillId = selectedSkill?.id || selectedSkill?.skill?.id || brainRoute?.primary_skill || '';
  const mode = brainRoute?.mode || '';
  if (content.length < 600) return { eligible: false, saved: false, reason: 'too_short' };
  if (Array.isArray(actions) && actions.some((action) => action?.type && !String(action.type).startsWith('blocked'))) {
    return { eligible: false, saved: false, reason: 'action_response' };
  }
  if (!AUTO_SAVE_SKILLS.has(skillId)) return { eligible: false, saved: false, reason: 'skill_not_eligible' };
  if (['casual_chat', 'clarification', 'memory_write', 'memory_recall', 'memory_forget', 'follow_up_transform'].includes(mode)) {
    return { eligible: false, saved: false, reason: 'route_not_eligible' };
  }
  if (mode && mode !== 'read_only_analysis') return { eligible: false, saved: false, reason: 'mode_not_analysis' };
  if (looksLikeShortOperationalReply(content)) return { eligible: false, saved: false, reason: 'operational_reply' };
  return { eligible: true, saved: null, reason: 'eligible' };
}

export function uniqueVaultDocumentCount(results) {
  if (!Array.isArray(results)) return 0;
  return new Set(results.map((item) => item?.document_id).filter(Boolean)).size;
}

export function pendingResolutionTraceName(type) {
  if (type === 'execute') return 'executed';
  if (type === 'cancelled') return 'cancelled';
  if (type === 'ask') return 'explained';
  return type || 'not_handled';
}

function buildResponseWorkingContext({ context, answer, plan, actions, message } = {}) {
  const current = context?.workingContext ?? {};
  const base = serializeWorkingContextForMetadata(current) ?? {
    language: current.language || 'en',
    last_subject: current.last_subject || null,
    last_action_result: current.last_action_result || null,
  };
  const firstAction = Array.isArray(actions) ? actions.find((action) => action?.type && !action.type.startsWith('blocked')) : null;
  if (!firstAction) return base;
  const actionType = firstAction.type;
  const result = firstAction.data;
  const args = {
    ...(plan?.args && typeof plan.args === 'object' ? plan.args : {}),
    ...(context?.pendingActionForResponse?.args && typeof context.pendingActionForResponse.args === 'object' ? context.pendingActionForResponse.args : {}),
  };
  const subject = buildSubjectFromActionResult({
    actionType,
    args,
    result,
    message,
    language: current.language || base.language,
  });
  if (!subject && context?.pendingActionForResponse) {
    const pendingSubject = buildSubjectFromPendingAction(context.pendingActionForResponse);
    if (!pendingSubject) return base;
  }
  const actionResult = {
    action_type: actionType,
    status: 'success',
    summary: String(answer || '').slice(0, 300),
    args,
    result: result && typeof result === 'object' ? result : {},
    created_at: new Date().toISOString(),
  };
  return {
    ...base,
    language: current.language || base.language || 'en',
    last_subject: subject || buildSubjectFromPendingAction(context?.pendingActionForResponse),
    last_action_result: actionResult,
  };
}
