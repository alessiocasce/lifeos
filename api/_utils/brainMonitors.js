import crypto from 'node:crypto';
import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import { loadMonitorPermissions } from './brainMonitorPermissions.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DUE_BATCH = 30;
const MONITOR_SELECT = 'id, user_id, monitor_type, topic_key, subject, reason, project_id, created_by, source_channel, source_ref, permission_basis, state, cadence_minutes, next_check_at, last_checked_at, last_triggered_at, expires_at, review_at, cooldown_minutes, confidence, max_checks, check_count, idempotency_key, metadata, created_at, updated_at';

export function normalizeMonitorProposal(input, { now = new Date() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (input.monitor_type !== 'project_staleness' || !UUID.test(String(input.project_id || ''))) return null;
  const reason = safeText(input.reason, 240);
  if (!reason || /\b(?:password|secret|token|api key|bearer)\b/i.test(reason)) return null;
  const confidence = Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0.7 || confidence > 1) return null;
  const cadenceMinutes = Number(input.cadence_minutes ?? 1440);
  if (!Number.isInteger(cadenceMinutes) || cadenceMinutes < 360 || cadenceMinutes > 10080) return null;
  const nowDate = new Date(now);
  const expiry = input.expires_at ? new Date(input.expires_at) : new Date(nowDate.getTime() + 45 * 86400000);
  if (Number.isNaN(nowDate.getTime()) || Number.isNaN(expiry.getTime())
    || expiry <= nowDate || expiry.getTime() > nowDate.getTime() + 90 * 86400000) return null;
  const topicKey = `project:${input.project_id.toLowerCase()}`;
  return {
    monitor_type: 'project_staleness', topic_key: topicKey, project_id: input.project_id,
    reason, confidence, cadence_minutes: cadenceMinutes, expires_at: expiry.toISOString(),
    cooldown_minutes: 10080, max_checks: 60,
    idempotency_key: crypto.createHash('sha256').update(`project_staleness:${topicKey}`).digest('hex'),
  };
}

export async function createValidatedMonitor({ proposal, userId = getActionUserId(), client = getSupabaseAdmin(),
  now = new Date(), sourceChannel = 'app', sourceRef = {}, explicitUser = false } = {}) {
  const normalized = normalizeMonitorProposal(proposal, { now });
  if (!normalized) return { status: 'rejected', reason: 'invalid_monitor_spec' };
  if (!['app', 'whatsapp', 'mcp'].includes(sourceChannel)) return { status: 'rejected', reason: 'invalid_source' };
  if (!explicitUser) {
    const permissions = await loadMonitorPermissions({ userId, client });
    if (!permissions.monitor) return { status: 'suggested', reason: 'monitor_permission_absent', proposal: normalized };
  }
  const project = await client.from('projects').select('id, name, status')
    .eq('user_id', userId).eq('id', normalized.project_id).maybeSingle();
  if (project.error) throw project.error;
  if (!project.data || project.data.status !== 'active') return { status: 'rejected', reason: 'project_not_active' };
  const existing = await client.from('brain_monitors').select(MONITOR_SELECT).eq('user_id', userId)
    .eq('monitor_type', normalized.monitor_type).eq('topic_key', normalized.topic_key)
    .in('state', ['active', 'suspended']).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { status: 'existing', monitor: existing.data };
  const safeRef = {};
  if (UUID.test(String(sourceRef?.message_id || ''))) safeRef.message_id = sourceRef.message_id;
  const inserted = await client.from('brain_monitors').insert({
    user_id: userId, ...normalized, subject: safeText(project.data.name, 160),
    created_by: explicitUser ? 'user' : 'brain', source_channel: sourceChannel,
    source_ref: safeRef, permission_basis: explicitUser ? 'explicit_user' : 'standing_monitor',
    next_check_at: new Date(now).toISOString(), review_at: new Date(new Date(now).getTime() + 30 * 86400000).toISOString(),
    metadata: { project_id: project.data.id },
  }).select(MONITOR_SELECT).single();
  if (inserted.error?.code === '23505') {
    const raced = await client.from('brain_monitors').select(MONITOR_SELECT).eq('user_id', userId)
      .eq('monitor_type', normalized.monitor_type).eq('topic_key', normalized.topic_key)
      .in('state', ['active', 'suspended']).maybeSingle();
    if (raced.error) throw raced.error;
    if (raced.data) return { status: 'existing', monitor: raced.data };
  }
  if (inserted.error) throw inserted.error;
  return { status: 'created', monitor: inserted.data };
}

export async function loadDueMonitors({ userId = getActionUserId(), client = getSupabaseAdmin(), now = new Date(), limit = MAX_DUE_BATCH } = {}) {
  const cap = Math.min(MAX_DUE_BATCH, Math.max(1, Number(limit) || MAX_DUE_BATCH));
  const result = await client.from('brain_monitors').select(MONITOR_SELECT).eq('user_id', userId)
    .eq('state', 'active').lte('next_check_at', new Date(now).toISOString())
    .order('next_check_at', { ascending: true }).limit(cap);
  if (result.error) throw result.error;
  return result.data || [];
}

export async function transitionMonitorState({ monitorId, state, userId = getActionUserId(), client = getSupabaseAdmin(), now = new Date() } = {}) {
  if (!UUID.test(String(monitorId || '')) || !['active', 'suspended', 'retired', 'expired'].includes(state)) {
    return { status: 'rejected', reason: 'invalid_transition' };
  }
  const updated = await client.from('brain_monitors').update({ state, updated_at: new Date(now).toISOString() })
    .eq('user_id', userId).eq('id', monitorId).in('state', ['active', 'suspended'])
    .select(MONITOR_SELECT).maybeSingle();
  if (updated.error) throw updated.error;
  return updated.data ? { status: 'updated', monitor: updated.data } : { status: 'unchanged' };
}

export async function proposeProjectMonitorFromTurn({ message, channel = 'app', messageId = null,
  userId = getActionUserId(), client = getSupabaseAdmin(), now = new Date() } = {}) {
  const text = String(message || '').trim();
  if (!/\b(?:i am working on|i'm working on|we are building|we're building|i am prioritizing|sto lavorando|stiamo costruendo|sto dando priorita)\b/i.test(text)) return { status: 'not_relevant' };
  const result = await client.from('projects').select('id, name, status').eq('user_id', userId).eq('status', 'active').limit(100);
  if (result.error) throw result.error;
  const matches = (result.data || []).filter((row) => row.name?.length >= 4 && text.toLowerCase().includes(row.name.toLowerCase()));
  if (matches.length !== 1) return { status: 'not_grounded' };
  return createValidatedMonitor({
    proposal: { monitor_type: 'project_staleness', project_id: matches[0].id,
      reason: 'Check whether an active project has lost momentum after this stated focus.', confidence: 0.8 },
    userId, client, now, sourceChannel: channel, sourceRef: { message_id: messageId },
  });
}

export async function retireProjectMonitorFromTurn({ message, userId = getActionUserId(), client = getSupabaseAdmin(), now = new Date() } = {}) {
  const text = String(message || '').trim();
  if (!text || text.includes('?')
    || !/\b(?:finished|completed|shipped|cancelled|stopped|finito|completato|chiuso|annullato|relevant)\b/i.test(text)) return 0;
  const result = await client.from('brain_monitors').select(MONITOR_SELECT).eq('user_id', userId)
    .eq('monitor_type', 'project_staleness').in('state', ['active', 'suspended']).limit(100);
  if (result.error) throw result.error;
  const matches = (result.data || []).filter((row) => row.subject?.length >= 4
    && isClearProjectClosureStatement(text, row.subject));
  if (matches.length !== 1) return 0;
  const retired = await transitionMonitorState({ monitorId: matches[0].id, state: 'retired', userId, client, now });
  return retired.status === 'updated' ? 1 : 0;
}

export function isClearProjectClosureStatement(message, subject) {
  const name = String(subject || '').trim().toLowerCase();
  const text = String(message || '').trim();
  if (name.length < 4 || text.includes('?')) return false;
  return text.split(/(?:[.!?;,]\s+|\n+)/).some((part) => {
    const clause = part.toLowerCase();
    if (!clause.includes(name)) return false;
    if (/\b(?:no longer relevant|not relevant anymore)\b/.test(clause)) return true;
    if (/\b(?:not|never|no|non|mai|haven't|hasn't|didn't|don't|doesn't|isn't|wasn't|might|maybe|if|wish|hope|forse|vorrei|spero)\b/.test(clause)) return false;
    return /\b(?:finished|completed|shipped|cancelled|stopped|finito|completato|chiuso|annullato)\b/.test(clause);
  });
}

function safeText(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text && text.length <= max && !/[\u0000-\u001f]/.test(text) ? text : null;
}
