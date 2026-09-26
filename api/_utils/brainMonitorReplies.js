import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import { transitionMonitorState } from './brainMonitors.js';

export const MONITOR_REPLY_TYPE = 'monitor';

export function normalizeMonitorReply(message) {
  const text = String(message || '').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (/\b(?:stop|basta|non.*(?:priorita|rilevante|interessa)|no longer|not (?:a )?priority|finished|completed|finito|completato)\b/.test(text)) return 'retire';
  if (/^(?:no|not now|later|piu tardi|non ora|non adesso|non ancora)[.! ]*$/.test(text)) return 'dismiss';
  if (/^(?:yes|si|yep|ancora si|still a priority|e ancora una priorita)[.! ]*$/.test(text)) return 'acknowledge';
  return 'other';
}

export async function resolveMonitorProactiveReply({ message, selection, client = getSupabaseAdmin(),
  userId = getActionUserId(), now = new Date(), messageId = null } = {}) {
  const intent = normalizeMonitorReply(message);
  const monitorId = selection?.proactive?.source_id;
  const outboxId = selection?.proactive?.outbox_message_id;
  if (!monitorId || !outboxId || selection?.proactive?.source_type !== 'monitor' || intent === 'other') return null;
  if (selection.type !== 'target' || selection.proactive.expired) {
    return replyResult('Questo aggiornamento e scaduto. Dimmi quale progetto intendi.', 'monitor_reply_stale');
  }
  const delivered = await client.from('brain_outbox_messages').select('id, metadata, status')
    .eq('user_id', userId).eq('id', outboxId).eq('source_type', 'monitor').eq('source_id', monitorId).maybeSingle();
  if (delivered.error) throw delivered.error;
  if (delivered.data?.status !== 'sent') return replyResult('Non trovo un aggiornamento consegnato da confermare.', 'monitor_not_delivered');
  if (delivered.data.metadata?.resolution) return replyResult('Questo aggiornamento e gia stato gestito.', 'monitor_already_answered');
  const found = await client.from('brain_monitors').select('id, user_id, state, subject, metadata, updated_at')
    .eq('user_id', userId).eq('id', monitorId).maybeSingle();
  if (found.error) throw found.error;
  const row = found.data;
  if (!row || !['active', 'suspended'].includes(row.state)) {
    return replyResult('Questo monitor e gia chiuso.', 'monitor_already_closed');
  }
  if (messageId && row.metadata?.last_feedback_message_id === messageId) {
    return replyResult('Ricevuto.', 'monitor_feedback_replayed');
  }
  if (intent === 'retire') {
    const transition = await transitionMonitorState({ monitorId, state: 'retired', userId, client, now });
    if (transition.status !== 'updated') return replyResult('Questo monitor e gia chiuso.', 'monitor_already_closed');
    await markPromptResolved({ outbox: delivered.data, resolution: 'retired', userId, client, now });
    return replyResult(`Capito. Non ti aggiorno piu su ${row.subject}.`, 'monitor_retired');
  }
  if (intent === 'dismiss') {
    const count = Math.min(3, Math.max(0, Number(row.metadata?.dismissal_count) || 0) + 1);
    const state = count >= 2 ? 'suspended' : row.state;
    const updated = await client.from('brain_monitors').update({
      state, metadata: { ...row.metadata, dismissal_count: count, last_dismissed_at: new Date(now).toISOString(),
        ...(messageId ? { last_feedback_message_id: messageId } : {}) },
      updated_at: new Date(now).toISOString(),
    }).eq('user_id', userId).eq('id', monitorId).eq('updated_at', row.updated_at).select('id').maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) return replyResult('Lo stato e cambiato. Riprova.', 'monitor_feedback_race');
    await markPromptResolved({ outbox: delivered.data, resolution: 'dismissed', userId, client, now });
    return replyResult(state === 'suspended' ? 'Capito. Metto in pausa questi aggiornamenti.' : 'Va bene, lascio stare per ora.',
      state === 'suspended' ? 'monitor_suspended_after_dismissal' : 'monitor_dismissed');
  }
  await markPromptResolved({ outbox: delivered.data, resolution: 'acknowledged', userId, client, now });
  return replyResult(`Ok. Tengo ${row.subject} tra le cose da seguire.`, 'monitor_acknowledged');
}

async function markPromptResolved({ outbox, resolution, userId, client, now }) {
  const updated = await client.from('brain_outbox_messages').update({
    metadata: { ...outbox.metadata, resolution: { type: resolution, resolved_at: new Date(now).toISOString() } },
  }).eq('user_id', userId).eq('id', outbox.id).eq('status', 'sent');
  if (updated.error) throw updated.error;
}

function replyResult(answer, reason) {
  return {
    answer,
    plan: { intent: 'monitor_feedback', needsRead: false, needsWrite: false, riskLevel: 'low', args: {}, reasoning: reason },
    actions: [], contextSummary: null, skipMemoryExtraction: true,
    proactive_reply_trace: { handled: true, expected_reply_type: MONITOR_REPLY_TYPE,
      action_type: reason, stale: false, ambiguous: false },
  };
}
