// One Jarvis Companion turn on WhatsApp (spec §5.1, step 1).
//
// Replaces the router -> BrainTurn Contract -> command draft -> planner
// pipeline behind COMPANION_AGENT. Order of a turn:
//   1. idempotent replay of an already-answered inbound message;
//   2. per-user serialization (one turn at a time across channels);
//   3. persist the user message to the shared timeline;
//   4. confirmation gate: a pending deletion runs only when THIS user message
//      is a deterministic affirmative (normalizePendingReplyIntent). The model
//      never sees a way to confirm on the user's behalf;
//   5. deterministic quote validation and, until step 2 replaces them, the
//      existing proactive check-in reply resolvers;
//   6. bare "annulla" undoes the last action without a model call;
//   7. otherwise the agent loop with real context and tools;
//   8. persist the reply with a sanitized trace (no chain-of-thought).

import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import { beginBrainChat, persistBrainAssistantMessage } from './brain.js';
import {
  attachBrainChatToTurn, buildBrainTurnWorkingContext, createBrainTurn, prepareBrainTurnInteraction, recordBrainTurnStage,
} from './brainTurn.js';
import { normalizePendingReplyIntent } from './brainPendingActions.js';
import { closeBrainInteraction } from './brainWhatsappReliability.js';
import { finalizeBrainTraceForResponse, logBrainTraceIfEnabled, maybeAttachDebug, sendAiSuccess } from './chat/chatResponse.js';
import { formatQuotedTargetClarification, maybeResolveProactiveWhatsappReply } from './chat/chatPendingActions.js';
import { sanitizeTraceValue } from './brainTrace.js';
import { runCompanionTurn, COMPANION_FALLBACK_REPLIES } from './companionAgentLoop.js';
import { generateCompanionTurn, resolveTierModel } from './companionModel.js';
import { companionSystemBlocks } from './companionPersona.js';
import { COMPANION_TOOLS } from './companionTools.js';
import { createSupabaseUsageSink } from './companionUsage.js';
import { createRefRegistry, undoCompanionAction } from './companionActionLedger.js';
import { createCompanionToolExecutor, executeConfirmedCompanionPending } from './companionToolExecutors.js';
import { loadCompanionContext } from './companionContext.js';

export const COMPANION_TURN_LIMITS = Object.freeze({
  maxSteps: 6,
  turnBudgetMs: 75_000,
  modelTimeoutMs: 45_000,
  lockTtlSeconds: 120,
  lockWaitMs: 25_000,
  lockPollMs: 400,
});

export const COMPANION_REPLIES = Object.freeze({
  pendingCancelled: 'Ok, non cancello niente.',
  pendingGone: (summary) => `Non lo trovo più: «${summary}» era già stato tolto.`,
  pendingDone: (summary) => `Fatto, ho cancellato «${summary}». Se era un errore scrivi "annulla".`,
  nothingToUndo: 'Non c\'è niente di recente da annullare.',
  undone: (summary) => `Annullato: ${lowerFirst(summary)}.`,
  failure: 'Scusa, ora non riesco a rispondere. Riprova tra un minuto.',
  partialFailure: (summaries) => `Ho fatto questo: ${summaries.join('; ')}. Poi mi sono bloccato: se serviva altro, ripetimelo.`,
});

const BARE_UNDO_RE = /^(?:annulla|annullalo|annullala|undo)(?:\s+(?:l'ultim[oa]|ultim[oa]|quello|quella))?[\s.!]*$/i;
// Quote outcomes the old pipeline refuses deterministically; a valid quote of
// an ordinary Brain message is passed to the model instead.
const REFUSED_QUOTE_INTENTS = new Set([
  'quoted_provider_id_not_found', 'quoted_target_scope_mismatch', 'quoted_target_thread_mismatch',
  'quoted_target_resolved', 'quoted_target_expired', 'quoted_reply_invalid',
]);

export async function handleCompanionChatMessage({
  message,
  source = 'whatsapp',
  requestId = null,
  clientRequestId = null,
  channelMetadata = null,
  debugFlags = null,
  endpointTrace = null,
  deps = {},
} = {}) {
  const client = deps.client ?? getSupabaseAdmin();
  const userId = deps.userId ?? getActionUserId();
  const clock = deps.now ?? (() => new Date());
  const startedAt = clock();
  const text = String(message ?? '').trim();
  const turn = createBrainTurn({ message: text, source, responseMode: source, requestId, clientRequestId, channelMetadata, debugFlags, endpointTrace });
  turn.brainTrace.route = 'companion_agent';
  turn.brainTrace.companion = { version: 1 };

  const replay = await findCompanionReplay({ client, userId, clientRequestId });
  if (replay) {
    recordBrainTurnStage(turn, 'idempotent_response_found', { thread_id: replay.thread_id });
    return { ...replay, idempotent_replay: true };
  }

  const lock = await acquireTurnLock({ client, userId, holder: turn.requestId, deps });
  recordBrainTurnStage(turn, 'companion_turn_lock', lock);
  try {
    let chat = null;
    try {
      chat = await (deps.beginChat ?? beginBrainChat)({
        source, message: text, requestId: turn.requestId, clientRequestId, channelMetadata, client, userId,
      });
    } catch (error) {
      recordBrainTurnStage(turn, 'companion_chat_persistence_failed', { error: safeError(error) });
    }
    attachBrainChatToTurn(turn, chat);
    const respond = (answer, extra = {}) => persistAndRespond({ turn, chat, client, userId, answer, ...extra });

    // 4. Confirmation gate.
    const pending = latestCompanionPending(chat?.conversationHistory, startedAt);
    const quotedOther = Boolean(channelMetadata?.whatsapp_has_quoted_message)
      && channelMetadata?.quoted_target?.message?.id !== pending?.message_id;
    if (pending && !quotedOther) {
      const intent = normalizePendingReplyIntent(text).intent;
      recordBrainTurnStage(turn, 'companion_pending_checked', { tool: pending.tool, intent });
      if (intent === 'confirm') {
        const result = await executeConfirmedCompanionPending({ client, userId, pending, turn: turnRef(turn, chat, source) });
        return respond(result.ok ? COMPANION_REPLIES.pendingDone(pending.summary) : COMPANION_REPLIES.pendingGone(pending.summary), {
          responseType: 'action_confirmation',
          pending: { ...pending, status: result.ok ? 'completed' : 'expired' },
          actions: result.ok ? [{ tool: pending.tool, summary: result.summary, ledgerId: result.ledgerId }] : [],
        });
      }
      if (intent === 'cancel') {
        return respond(COMPANION_REPLIES.pendingCancelled, { responseType: 'casual', pending: { ...pending, status: 'cancelled' } });
      }
      recordBrainTurnStage(turn, 'companion_pending_superseded', { tool: pending.tool });
    }

    // 5. Quote validation and legacy proactive check-in replies.
    let replyingTo = null;
    if (source === 'whatsapp' && chat) {
      buildBrainTurnWorkingContext(turn);
      const selection = await (deps.prepareInteraction ?? prepareBrainTurnInteraction)(turn);
      if (selection && REFUSED_QUOTE_INTENTS.has(selection.intent)) {
        return respond(formatQuotedTargetClarification(selection.intent, 'it'), { responseType: 'clarification' });
      }
      if (selection?.path === 'proactive_reply') {
        const legacy = await (deps.resolveProactiveReply ?? resolveLegacyProactiveReply)({ message: text, turn });
        if (legacy) return legacy;
      }
      const quoted = channelMetadata?.quoted_target?.message;
      if (quoted?.thread_id === chat.thread?.id && quoted?.content) replyingTo = quoted.content;
      else if (turn.activeInteraction?.state === 'active' && selection?.path === 'proactive_reply') {
        replyingTo = findMessageContent(chat.conversationHistory, turn.activeInteraction.assistant_message_id);
      }
      turn.companionSelection = selection;
    }

    // 6. Bare "annulla": deterministic undo of the latest action.
    if (BARE_UNDO_RE.test(text)) {
      const undo = await undoCompanionAction({ client, userId, now: clock(), turn: turnRef(turn, chat, source) });
      recordBrainTurnStage(turn, 'companion_bare_undo', { ok: undo.ok, error: undo.error ?? null });
      return respond(undo.ok ? COMPANION_REPLIES.undone(undo.undone.summary) : COMPANION_REPLIES.nothingToUndo, {
        responseType: undo.ok ? 'action_confirmation' : 'casual',
        actions: undo.ok ? [{ tool: 'undo_action', summary: undo.undoRow.summary, ledgerId: undo.undoRow.id }] : [],
      });
    }

    // 7. Agent loop.
    return await runAgent({ turn, chat, client, userId, text, source, replyingTo, clock, deps, respond });
  } finally {
    await releaseTurnLock({ client, userId, holder: turn.requestId, lock });
  }
}

async function runAgent({ turn, chat, client, userId, text, source, replyingTo, clock, deps, respond }) {
  const now = clock();
  const refs = createRefRegistry();
  const turnInfo = turnRef(turn, chat, source);
  const executor = createCompanionToolExecutor({ client, userId, now, turn: turnInfo, refs, ...(deps.searchVault ? { searchVault: deps.searchVault } : {}) });
  let loaded;
  try {
    loaded = await loadCompanionContext({
      client, userId, now, refs, message: text, channel: source, currentMessageId: chat?.userMessage?.id ?? null, replyingTo,
    });
  } catch (error) {
    loaded = { context: { now: now.toISOString(), channel: source }, history: [], warnings: [{ section: 'all', error: safeError(error) }] };
  }
  const model = deps.model ?? resolveTierModel('fast', deps.env ?? process.env);
  const deadline = Date.now() + COMPANION_TURN_LIMITS.turnBudgetMs;
  const usageSink = deps.usageSink ?? createSupabaseUsageSink({ supabase: client, userId });
  const generate = deps.generate ?? ((request) => generateWithRetry({ request, model, usageSink, requestId: turn.requestId, deadline, env: deps.env }));

  let result = null;
  let failure = null;
  try {
    result = await runCompanionTurn({
      generate,
      executeTool: executor.executeTool,
      system: companionSystemBlocks(loaded.context),
      history: loaded.history,
      message: text,
      tools: COMPANION_TOOLS,
      maxSteps: COMPANION_TURN_LIMITS.maxSteps,
    });
  } catch (error) {
    failure = error;
  }

  const actions = executor.state.actions;
  const pending = executor.state.pending
    ? { ...executor.state.pending, message_id: null }
    : null;
  let answer;
  if (failure) {
    answer = actions.length ? COMPANION_REPLIES.partialFailure(actions.map((action) => action.summary)) : COMPANION_REPLIES.failure;
  } else {
    answer = cleanReply(result.reply, { actions, pending });
  }

  turn.brainTrace.companion = sanitizeTraceValue({
    version: 1,
    model: model.spec ?? `${model.provider}:${model.model}`,
    stop_reason: result?.stopReason ?? 'error',
    steps: (result?.steps ?? []).map((step) => ({ latency_ms: step.latencyMs, cost_usd: step.costUsd, stop: step.stopReason, tool_calls: step.toolCalls, usage: step.usage })),
    tool_calls: (result?.toolCalls ?? []).map((call) => ({
      step: call.step,
      name: call.name,
      input: call.input,
      ok: !call.isError,
      error: call.isError ? String(call.output?.error ?? '').slice(0, 200) : null,
      action_id: call.output?.action_id ?? null,
    })),
    actions: actions.map((action) => ({ tool: action.tool, summary: action.summary, ledger_id: action.ledgerId })),
    pending: pending ? { tool: pending.tool, summary: pending.summary } : null,
    usage: result?.usage ?? null,
    cost_usd: result?.costUsd ?? null,
    model_latency_ms: result?.modelLatencyMs ?? null,
    loop_latency_ms: result?.latencyMs ?? null,
    context: {
      history_entries: loaded.history.length,
      commitments: loaded.context.commitments?.length ?? 0,
      calendar: loaded.context.calendar?.length ?? 0,
      recent_actions: loaded.context.recentActions?.length ?? 0,
      replying_to: Boolean(replyingTo),
      warnings: loaded.warnings,
    },
    tool_errors: executor.state.errors,
    error: failure ? { name: failure.name, status: failure.status ?? null, message: safeError(failure) } : null,
  });

  if (turn.companionSelection?.path === 'explicit_health' && turn.activeInteraction?.state === 'active' && actions.length) {
    await closeBrainInteraction({
      threadId: chat?.thread?.id,
      assistantMessageId: turn.activeInteraction.assistant_message_id,
      expectedVersion: turn.activeInteraction.version,
      state: 'superseded',
      client,
      userId,
    }).catch(() => {});
  }

  return respond(answer, {
    responseType: failure ? 'error' : actions.length ? 'action_confirmation' : pending ? 'clarification' : 'casual',
    pending,
    actions,
    errorCode: failure ? 'companion_model_error' : null,
  });
}

async function persistAndRespond({ turn, chat, client, userId, answer, responseType = 'casual', pending = null, actions = [], errorCode = null }) {
  const trace = finalizeBrainTraceForResponse(turn, {
    answer,
    actions: actions.map((action) => ({ type: action.tool, data: { id: action.ledgerId } })),
    final_response_type: responseType,
    error_code: errorCode,
  });
  let persisted = null;
  try {
    persisted = await persistBrainAssistantMessage({
      chat,
      answer,
      requestId: turn.requestId,
      clientRequestId: turn.clientRequestId,
      actionType: actions.length ? 'companion_agent_write' : 'companion_agent',
      actions: [],
      plan: null,
      recordRefs: actions.filter((action) => action.ledgerId).map((action) => ({ type: 'brain_action_ledger', id: action.ledgerId })),
      brainTrace: trace,
      extraMetadata: {
        companion_agent: true,
        ...(pending ? { companion_pending: pending } : {}),
      },
      client,
      userId,
    });
  } catch (error) {
    console.error('[LifeOS Companion persistence warning]', JSON.stringify({ requestId: turn.requestId, error: safeError(error) }));
  }
  logBrainTraceIfEnabled(turn, trace);
  const payload = {
    answer,
    actions: [],
    plan: null,
    ...(turn.clientRequestId ? { client_request_id: turn.clientRequestId } : {}),
    ...(chat?.thread?.id ? { thread_id: chat.thread.id, persisted_user_message: chat.userMessage ?? null, persisted_message: persisted } : {}),
  };
  return maybeAttachDebug(payload, turn, trace);
}

// The legacy deterministic resolver for replies to proactive check-ins
// (habits, wake/sleep, memo reminders). Step 2 replaces it.
async function resolveLegacyProactiveReply({ message, turn }) {
  const result = await maybeResolveProactiveWhatsappReply({ message, resolvedSource: 'whatsapp', context: turn });
  if (!result) return null;
  recordBrainTurnStage(turn, 'companion_legacy_proactive_reply', { handled: true });
  return sendAiSuccess(null, 200, { ...result, skipMemoryExtraction: true }, turn, { message, source: 'whatsapp' });
}

// The latest assistant message owns a pending deletion only if it is the
// newest assistant message and the pending has not expired.
export function latestCompanionPending(history = [], now = new Date()) {
  const latest = [...(history ?? [])].reverse().find((entry) => entry?.role === 'assistant');
  const pending = latest?.metadata?.companion_pending;
  if (!pending || pending.status !== 'awaiting_confirmation') return null;
  if (pending.expires_at && new Date(pending.expires_at).getTime() <= new Date(now).getTime()) return null;
  return { ...pending, message_id: latest.id };
}

// Keeps WhatsApp text clean: never empty, never JSON, code or debug output,
// and a pending deletion always ends with an explicit question.
export function cleanReply(reply, { actions = [], pending = null } = {}) {
  let text = String(reply ?? '').trim();
  if (/```|^\s*[{[]\s*"|\b(?:brain_trace|tool_calls?|function_?call|action_id|commitment_id)\b/i.test(text)) text = '';
  if (!text) {
    text = actions.length
      ? `${actions.map((action) => action.summary).join('. ')}.`
      : COMPANION_FALLBACK_REPLIES.stuck;
  }
  if (pending && !text.includes('?')) text = `${text}\nConfermi che cancello «${pending.summary}»?`;
  return text.slice(0, 3500);
}

async function generateWithRetry({ request, model, usageSink, requestId, deadline, env }) {
  let attempt = 0;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) throw Object.assign(new Error('Companion turn budget exhausted.'), { name: 'CompanionDeadlineError' });
    try {
      return await generateCompanionTurn({
        model,
        tier: 'fast',
        ...request,
        usageSink,
        purpose: 'chat',
        requestId,
        timeoutMs: Math.min(COMPANION_TURN_LIMITS.modelTimeoutMs, remaining),
        ...(env ? { env } : {}),
      });
    } catch (error) {
      attempt += 1;
      if (!error?.retryable || attempt > 1 || deadline - Date.now() < 10_000) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
}

async function acquireTurnLock({ client, userId, holder, deps }) {
  const waitMs = deps.lockWaitMs ?? COMPANION_TURN_LIMITS.lockWaitMs;
  const started = Date.now();
  for (;;) {
    const { data, error } = await client.rpc('companion_try_turn_lock', {
      p_user_id: userId, p_holder: String(holder).slice(0, 160), p_ttl_seconds: COMPANION_TURN_LIMITS.lockTtlSeconds,
    });
    // Without the migration the lock is unavailable; the bridge still
    // serializes per sender, so the turn proceeds and the trace says so.
    if (error) return { acquired: false, skipped: true, error: String(error.message ?? error).slice(0, 160) };
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.acquired) return { acquired: true, waited_ms: Date.now() - started };
    if (Date.now() - started >= waitMs) return { acquired: false, timed_out: true, waited_ms: Date.now() - started };
    await new Promise((resolve) => setTimeout(resolve, deps.lockPollMs ?? COMPANION_TURN_LIMITS.lockPollMs));
  }
}

async function releaseTurnLock({ client, userId, holder, lock }) {
  if (!lock?.acquired) return;
  try {
    await client.rpc('companion_release_turn_lock', { p_user_id: userId, p_holder: String(holder).slice(0, 160) });
  } catch {
    // The lease expires on its own.
  }
}

async function findCompanionReplay({ client, userId, clientRequestId }) {
  if (!clientRequestId) return null;
  const { data, error } = await client.from('ai_chat_messages')
    .select('id, thread_id, role, content, request_id, action_type, metadata, created_at')
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .contains('metadata', { client_request_id: clientRequestId })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) return null;
  return {
    answer: data.content || '',
    actions: [],
    plan: null,
    client_request_id: clientRequestId,
    thread_id: data.thread_id,
    persisted_message: data,
  };
}

function turnRef(turn, chat, source) {
  return {
    requestId: turn.requestId,
    threadId: chat?.thread?.id ?? null,
    userMessageId: chat?.userMessage?.id ?? null,
    channel: source === 'app' ? 'app' : 'whatsapp',
  };
}

function findMessageContent(history = [], id) {
  return (history ?? []).find((entry) => entry?.id === id)?.content ?? null;
}

function lowerFirst(text) {
  const value = String(text ?? '').trim();
  return value ? value[0].toLowerCase() + value.slice(1) : value;
}

function safeError(error) {
  return String(error?.message ?? error ?? 'unknown').replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]').slice(0, 240);
}
