import { HttpError } from '../http.js';
import { addBrainTraceStep } from '../brainTrace.js';
import {
  beginBrainChat,
  extractAndPersistBrainKnowledge,
  loadBrainContext,
  persistBrainAssistantMessage,
  persistBrainErrorMessage,
} from '../brain.js';
import { documentTypesForSkill } from './chatScheduleParsing.js';
import { fallbackBrainRoute, routeBrainMessageWithAI, serializeBrainRoute } from '../brainRouter.js';
import { finalizeBrainTraceForResponse, logBrainTraceIfEnabled } from './chatResponse.js';
import { formatVaultResultsForPrompt, searchBrainVault, serializeVaultContextForMetadata } from '../brainVault.js';
import { getActionUserId, getSupabaseAdmin } from '../supabaseAdmin.js';
import { isMemoryRecallRequest } from './chatMemoryAnswers.js';
import { serializeSkillSelection } from './chatClassification.js';
import { serializeWorkingContextForMetadata } from '../brainWorkingContext.js';
import { shouldRetrieveBrainVault } from '../brainVaultEligibility.js';

export async function safeBeginBrainChat(options) {
  try {
    return await beginBrainChat(options);
  } catch (error) {
    console.error('[LifeOS Brain chat persistence warning]', JSON.stringify({
      requestId: options?.requestId,
      stage: 'begin_chat',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    return null;
  }
}

export async function findExistingBrainResponseByClientRequestId(clientRequestId) {
  if (!clientRequestId) return null;
  try {
    const result = await getSupabaseAdmin()
      .from('ai_chat_messages')
      .select('id, thread_id, role, content, request_id, action_type, metadata, created_at')
      .eq('user_id', getActionUserId())
      .eq('role', 'assistant')
      .contains('metadata', { client_request_id: clientRequestId })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw result.error;
    const message = result.data;
    if (!message?.id) return null;
    const metadata = message.metadata && typeof message.metadata === 'object' ? message.metadata : {};
    return {
      answer: message.content || '',
      plan: null,
      actions: [],
      contextSummary: null,
      selected_skill: metadata.selected_skill ?? null,
      brain_route: metadata.brain_route ?? null,
      ...(metadata.vault_context?.retrieved_count ? { vault_context: metadata.vault_context } : {}),
      client_request_id: clientRequestId,
      thread_id: message.thread_id,
      persisted_message: message,
      idempotent_replay: true,
    };
  } catch (error) {
    console.error('[LifeOS Brain idempotency warning]', JSON.stringify({
      clientRequestId,
      stage: 'existing_response_lookup',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    return null;
  }
}

export function normalizeClientRequestId(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.replace(/[^\w:.-]/g, '').slice(0, 120) || null;
}

export async function safeLoadBrainContext(context) {
  try {
    return await loadBrainContext({ message: isMemoryRecallRequest(context?.message) ? '' : (context?.message || '') });
  } catch (error) {
    console.error('[LifeOS Brain memory warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'load_context',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    return { memories: [], insights: [] };
  }
}

export async function safeRouteBrainMessage({ message, source, brainChat, brainContext, classification, context }) {
  try {
    const route = await routeBrainMessageWithAI({
      message,
      source,
      brainChat,
      brainContext,
      classification,
    });
    addBrainTraceStep(context?.brainTrace, 'semantic_router_completed', {
      fallback: false,
      mode: route?.mode,
      primary_skill: route?.primary_skill,
      confidence: route?.confidence,
    });
    return route;
  } catch (error) {
    console.error('[LifeOS Brain router warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'semantic_router',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    addBrainTraceStep(context?.brainTrace, 'semantic_router_failed', {
      fallback: true,
      error_code: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    });
    return fallbackBrainRoute({
      message,
      classification,
      brainChat,
      reason: 'AI semantic router failed; deterministic fallback route used.',
    });
  }
}

export async function safeLoadBrainVaultContext({ message, brainRoute, brainSkill, context }) {
  try {
    if (context?.brainTurnContract?.disallowed_steals?.includes('vault')) {
      return { attempted: false, results: [], formatted: 'No relevant Brain Vault reports were retrieved.', reason: 'blocked_by_brain_turn_contract' };
    }
    if (!shouldRetrieveBrainVault({ brainRoute, brainSkill })) {
      return { attempted: false, results: [], formatted: 'No relevant Brain Vault reports were retrieved.' };
    }
    const skill = brainSkill?.skill ?? brainSkill;
    const query = [
      message,
      brainRoute?.user_intent_summary,
      skill?.label,
      Array.isArray(brainRoute?.needs_data) ? brainRoute.needs_data.join(' ') : '',
    ].filter(Boolean).join('\n');
    const results = await searchBrainVault({
      query,
      documentTypes: documentTypesForSkill(skill),
      matchCount: 8,
      matchThreshold: 0.18,
    });
    return {
      attempted: true,
      results,
      formatted: formatVaultResultsForPrompt(results),
    };
  } catch (error) {
    console.error('[LifeOS Brain Vault retrieval warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'vault_retrieval',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    return { attempted: true, error: error instanceof Error ? error.message : String(error ?? 'Unknown error'), results: [], formatted: 'No relevant Brain Vault reports were retrieved.' };
  }
}

export async function safePersistBrainSuccess({ context, answer, plan, actions, actionType, recordRefs, selectedSkill, brainRoute, vaultContext, workingContext, brainTrace }) {
  try {
    return await persistBrainAssistantMessage({
      chat: context?.brainChat,
      answer,
      requestId: context?.requestId,
      clientRequestId: context?.clientRequestId,
      actionType,
      actions,
      plan,
      recordRefs,
      selectedSkill,
      brainRoute,
      vaultContext,
      pendingAction: context?.pendingActionForResponse ?? null,
      workingContext,
      brainTrace,
    });
  } catch (error) {
    console.error('[LifeOS Brain chat persistence warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'assistant_message',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    return null;
  }
}

export async function safePersistBrainError(context, error) {
  try {
    const trace = finalizeBrainTraceForResponse(context, {
      final_response_type: 'error',
      error_code: error instanceof HttpError ? `http_${error.status}` : 'brain_error',
      error_message: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    });
    await persistBrainErrorMessage({
      chat: context?.brainChat,
      error,
      requestId: context?.requestId,
      clientRequestId: context?.clientRequestId,
      selectedSkill: serializeSkillSelection(context?.brainSkill),
      brainRoute: serializeBrainRoute(context?.brainRoute),
      vaultContext: serializeVaultContextForMetadata(context?.brainVault?.results),
      pendingAction: context?.pendingActionForResponse ?? null,
      workingContext: serializeWorkingContextForMetadata(context?.workingContext),
      brainTrace: trace,
    });
    logBrainTraceIfEnabled(context, trace);
  } catch (persistenceError) {
    console.error('[LifeOS Brain chat persistence warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'assistant_error_message',
      error: persistenceError instanceof Error ? persistenceError.message : String(persistenceError ?? 'Unknown error'),
    }));
  }
}

export async function safeExtractBrainKnowledge({ context, message, answer, actionType, extractKnowledge = extractAndPersistBrainKnowledge }) {
  if (!context?.brainChat) return;
  try {
    await extractKnowledge({
      userMessage: message,
      assistantAnswer: answer,
      actionType,
      existingMemories: context?.brainContext?.memories ?? [],
      channel: context?.source || 'app',
      sourceMessageId: context?.brainChat?.userMessage?.id || null,
    });
  } catch (error) {
    console.error('[LifeOS Brain memory extraction warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'memory_extraction',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
  }
}
