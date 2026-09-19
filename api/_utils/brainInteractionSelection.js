import { normalizePendingReplyIntent } from './brainPendingActions.js';
import { selectProactiveReplyTarget, selectTrustedQuotedProactiveReplyTarget } from './brainProactiveReplies.js';
import { parseExplicitHealthSelfReport } from './brainHealthSelfReports.js';
import { looksLikeExplicitNewCommand, normalizeTurnText } from './brainTurnArbitration.js';
import { normalizeAccountabilityTarget } from './brainMetadata.js';
import { shouldAttemptRoutineSemanticInference } from './brainRoutineSemantics.js';

export function selectBrainTurnInteraction({
  message,
  brainChat,
  pendingAction = null,
  activeInteraction = null,
  quotedTarget = null,
  quotedMessagePresent = false,
  quotedLookupStatus = null,
  now = new Date(),
} = {}) {
  const healthReport = parseExplicitHealthSelfReport(message, { now });
  if (healthReport) return selection({
    path: 'explicit_health', intent: healthReport.kind === 'habit_done' ? 'new_write' : 'health_no_write',
    sourceOfWriteIntent: healthReport.kind === 'habit_done' ? 'current_message' : 'none',
    method: 'grounded_current_message', target: healthReport, reason: 'Grounded Health self-report in current message.',
  });

  const pendingIntent = pendingAction ? normalizePendingReplyIntent(message) : { intent: 'other' };
  const deliveredProactiveOwnsTurn = activeInteraction?.state === 'active' && activeInteraction.owner_kind === 'proactive';
  if (pendingAction && pendingIntent.intent === 'cancel'
    && (isStrongPendingCancellation(message) || (!quotedMessagePresent && !deliveredProactiveOwnsTurn))) return selection({
    path: 'pending_action', intent: 'pending_cancellation', sourceOfWriteIntent: 'pending_action',
    method: 'context_free_pending_cancel', pendingAction, reason: 'Active pending action owns context-free cancellation.',
  });
  if (looksLikeExplicitNewCommand(message)) return selection({
    path: 'explicit_command', intent: 'new_write', sourceOfWriteIntent: 'current_message',
    method: 'grounded_current_message', reason: 'Current message is an independent content-bearing command.',
  });

  if (quotedTarget?.message) {
    const quotedPending = quotedTarget.message.metadata?.pending_action;
    if (pendingAction && quotedPending?.id === pendingAction.id && ['confirm', 'clarify'].includes(pendingIntent.intent)) {
      return selection({
        path: 'pending_action', intent: pendingIntent.intent === 'confirm' ? 'pending_confirmation' : 'pending_clarification',
        sourceOfWriteIntent: pendingIntent.intent === 'confirm' ? 'pending_action' : 'none',
        method: 'trusted_native_quote', pendingAction, assistantMessageId: quotedTarget.message.id,
        ownerId: quotedTarget.delivery?.id, reason: 'Trusted quote selected matching pending action prompt.',
      });
    }
    const quotedSelection = selectTrustedQuotedProactiveReplyTarget({ message, assistantMessage: quotedTarget.message, now });
    if (quotedSelection?.type === 'target') return selection({
      path: 'proactive_reply', intent: 'proactive_reply', sourceOfWriteIntent: 'proactive_message',
      method: 'trusted_native_quote', proactiveSelection: quotedSelection,
      assistantMessageId: quotedTarget.message.id, ownerId: quotedTarget.delivery?.id,
      reason: 'Trusted provider-message mapping selected quoted assistant target.',
    });
    const intent = quotedSelection?.type === 'stale'
      ? 'quoted_target_expired'
      : quotedSelection?.type === 'resolved'
        ? 'quoted_target_resolved'
        : quotedSelection?.type === 'invalid_reply'
          ? 'quoted_reply_invalid'
          : 'quoted_target_not_replyable';
    return selection({
      path: 'clarification', intent, method: `trusted_native_quote_${quotedSelection?.type || 'invalid'}`,
      assistantMessageId: quotedTarget.message.id, reason: 'Quoted assistant message is not an eligible reply target.', needsClarification: true,
    });
  }
  if (quotedMessagePresent) return selection({
    path: 'clarification',
    intent: quotedLookupStatus === 'recipient_mismatch'
      ? 'quoted_target_scope_mismatch'
      : quotedLookupStatus === 'resolved_thread_mismatch'
        ? 'quoted_target_thread_mismatch'
        : 'quoted_provider_id_not_found',
    method: quotedLookupStatus || 'unresolved_native_quote',
    reason: 'Quoted WhatsApp provider ID did not resolve to this LifeOS thread and recipient.', needsClarification: true,
  });

  if (activeInteraction?.state === 'active') {
    if (activeInteraction.owner_kind === 'pending_action' && pendingAction
      && activeInteraction.pending_action_id === pendingAction.id
      && ['confirm', 'clarify'].includes(pendingIntent.intent)) {
      return selection({
        path: 'pending_action', intent: pendingIntent.intent === 'confirm' ? 'pending_confirmation' : 'pending_clarification',
        sourceOfWriteIntent: pendingIntent.intent === 'confirm' ? 'pending_action' : 'none',
        method: 'active_interaction_owner', pendingAction, assistantMessageId: activeInteraction.assistant_message_id,
        ownerId: `${activeInteraction.thread_id}:${activeInteraction.version}`,
        interactionVersion: activeInteraction.version, expiresAt: activeInteraction.expires_at,
        reason: 'Persisted active pending interaction owns compatible short reply.',
      });
    }
    if (activeInteraction.owner_kind === 'proactive') {
      const ownerMessage = findAssistantMessage(brainChat, activeInteraction.assistant_message_id)
        || messageFromOwnerPayload(activeInteraction);
      const proactiveSelection = proactiveSelectionFromMessage({
        message,
        assistantMessage: ownerMessage,
        now,
        allowRoutineSemanticCandidate: true,
      });
      if (proactiveSelection?.type === 'target') return selection({
        path: 'proactive_reply', intent: 'proactive_reply', sourceOfWriteIntent: 'proactive_message',
        method: 'active_interaction_owner', proactiveSelection,
        assistantMessageId: activeInteraction.assistant_message_id,
        ownerId: `${activeInteraction.thread_id}:${activeInteraction.version}`,
        interactionVersion: activeInteraction.version, expiresAt: activeInteraction.expires_at,
        reason: 'Persisted active proactive interaction owns compatible short reply.',
      });
    }
  }

  const latestAssistant = [...(brainChat?.conversationHistory || [])].reverse().find((item) => item?.role === 'assistant');
  if (latestAssistant?.metadata?.proactive_message && isWithinLegacyOwnerLease(latestAssistant.created_at, now)) {
    const proactiveSelection = proactiveSelectionFromMessage({
      message,
      assistantMessage: latestAssistant,
      now,
      allowRoutineSemanticCandidate: true,
    });
    if (proactiveSelection?.type === 'target') return selection({
      path: 'proactive_reply', intent: 'proactive_reply', sourceOfWriteIntent: 'proactive_message',
      method: 'legacy_adjacent_assistant', proactiveSelection, assistantMessageId: latestAssistant.id,
      reason: 'Legacy bridge fallback used immediately adjacent proactive assistant question.',
    });
  }

  if (pendingAction && ['confirm', 'clarify'].includes(pendingIntent.intent)) return selection({
    path: 'pending_action', intent: pendingIntent.intent === 'confirm' ? 'pending_confirmation' : 'pending_clarification',
    sourceOfWriteIntent: pendingIntent.intent === 'confirm' ? 'pending_action' : 'none',
    method: 'legacy_pending_fallback', pendingAction,
    reason: 'Active pending action owns compatible reply because no newer eligible interaction exists.',
  });

  if (isConfusionOrAbandon(message)) return selection({
    path: 'clarification', intent: 'abandon', method: 'confusion_without_owner',
    reason: 'User rejected or did not understand unowned context.', needsClarification: true,
  });
  return selection({ path: 'normal', intent: 'other', method: 'none', reason: 'No authoritative interaction target matched.' });
}

export function serializeInteractionSelection(value) {
  if (!value) return null;
  return {
    path: value.path,
    intent: value.intent,
    source_of_write_intent: value.source_of_write_intent,
    selection_method: value.selection_method,
    owner_id: value.owner_id,
    interaction_version: value.interaction_version,
    assistant_message_id: value.assistant_message_id,
    pending_action_id: value.pending_action_id,
    outbox_message_id: value.outbox_message_id,
    source_type: value.source_type,
    source_id: value.source_id,
    expected_reply_type: value.expected_reply_type,
    reason: value.reason,
    needs_clarification: value.needs_clarification,
    expires_at: value.expires_at,
  };
}

function findAssistantMessage(brainChat, id) {
  return (brainChat?.conversationHistory || []).find((item) => item?.role === 'assistant' && item.id === id) || null;
}

function proactiveSelectionFromMessage({ message, assistantMessage, now, allowRoutineSemanticCandidate = false }) {
  if (!assistantMessage) return null;
  const selected = selectProactiveReplyTarget({
    message,
    brainChat: { conversationHistory: [assistantMessage] },
    now,
  });
  if (selected?.type !== 'none' || !allowRoutineSemanticCandidate) return selected;
  const accountability = normalizeAccountabilityTarget(assistantMessage.metadata?.accountability);
  if (assistantMessage.metadata?.expected_reply_type !== 'accountability'
    || accountability?.kind !== 'habit_missing'
    || !shouldAttemptRoutineSemanticInference({ message, targetRoutineId: accountability.habit_id })) return selected;
  return selectTrustedQuotedProactiveReplyTarget({ message, assistantMessage, now });
}

function messageFromOwnerPayload(activeInteraction) {
  const payload = activeInteraction?.owner_payload;
  if (!payload || typeof payload !== 'object') return null;
  const accountability = normalizeAccountabilityTarget(payload.accountability);
  return {
    id: activeInteraction.assistant_message_id,
    role: 'assistant',
    created_at: activeInteraction.opened_at,
    content: '',
    metadata: {
      ...payload,
      ...(accountability ? { accountability } : {}),
      proactive_message: payload.proactive_message === true,
    },
  };
}

function selection({ path, intent, sourceOfWriteIntent = 'none', method, ownerId = null, assistantMessageId = null,
  interactionVersion = null, expiresAt = null, pendingAction = null, proactiveSelection = null, target = null, reason, needsClarification = false }) {
  const proactive = proactiveSelection?.proactive;
  return Object.freeze({
    path,
    intent,
    source_of_write_intent: sourceOfWriteIntent,
    selection_method: method,
    owner_id: ownerId,
    interaction_version: interactionVersion,
    assistant_message_id: assistantMessageId,
    pending_action_id: pendingAction?.id ?? null,
    outbox_message_id: proactive?.outbox_message_id ?? null,
    source_type: proactive?.source_type ?? (target ? 'health' : null),
    source_id: proactive?.source_id ?? null,
    expected_reply_type: proactive?.expected_reply_type ?? proactiveSelection?.reply_type ?? null,
    target,
    pending_action: pendingAction,
    proactive_selection: proactiveSelection,
    selected_at: new Date().toISOString(),
    expires_at: expiresAt,
    reason,
    needs_clarification: Boolean(needsClarification),
  });
}

function isConfusionOrAbandon(message) {
  const text = normalizeTurnText(message);
  return /^(?:in che senso|non capisco|non so di cosa (?:tu )?stia parlando|nessuno|lascia stare|forget it|i do not understand|what do you mean)$/.test(text);
}

function isStrongPendingCancellation(message) {
  const text = normalizeTurnText(message);
  return /\b(?:annulla|cancella|lascia stare|lascia perdere|non farlo|cancel|nevermind|never mind)\b/.test(text);
}

function isWithinLegacyOwnerLease(createdAt, now) {
  const timestamp = Date.parse(createdAt || '');
  return Number.isFinite(timestamp) && now.getTime() - timestamp >= 0 && now.getTime() - timestamp <= 30 * 60000;
}
