import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import { loadMonitorPermissions } from './brainMonitorPermissions.js';
import { loadDueMonitors } from './brainMonitors.js';
import { decideAttention, loadRecentAttentionState, nextAvailableAttentionTime, recordAttentionDecision } from './brainAttentionEngine.js';
import { renderApprovedMonitorMessage } from './brainButler.js';

const DAY_MS = 86400000;
const STALE_DAYS = 21;
const MAX_BATCH = 30;

export function evaluateProjectMonitorSignal({ monitor, project, sessions = [], sessionHistoryTruncated = false, now = new Date() } = {}) {
  if (!project || project.status !== 'active') return { state: 'resolved', importance: 0, confidence: 1,
    topic_key: monitor.topic_key, project_id: monitor.project_id, monitor_id: monitor.id };
  const matchingSessions = sessions.filter((row) => row.project_id === monitor.project_id);
  if (sessionHistoryTruncated && !matchingSessions.length) return { state: 'unchanged', importance: 1,
    confidence: 0.5, topic_key: monitor.topic_key, project_id: monitor.project_id, monitor_id: monitor.id };
  const activity = [project.updated_at, project.created_at,
    ...matchingSessions.map((row) => row.ended_at || row.started_at)]
    .map((value) => Date.parse(value || '')).filter(Number.isFinite);
  const last = Math.max(...activity, 0);
  const ageDays = last ? Math.floor((new Date(now).getTime() - last) / DAY_MS) : 0;
  return {
    state: ageDays >= STALE_DAYS ? 'stale' : 'unchanged',
    importance: ageDays >= STALE_DAYS ? 3 : 1,
    confidence: ageDays >= STALE_DAYS ? 0.82 : 0.7,
    topic_key: monitor.topic_key, project_id: monitor.project_id, monitor_id: monitor.id,
    last_activity_at: last ? new Date(last).toISOString() : null, age_days: ageDays,
  };
}

export async function evaluateDueMonitors({ userId = getActionUserId(), client = getSupabaseAdmin(),
  now = new Date(), recipient, limit = MAX_BATCH, preview = false } = {}) {
  const time = new Date(now);
  const due = await loadDueMonitors({ userId, client, now: time, limit });
  if (!due.length) return { candidates: [], skipped: [], checked_count: 0 };
  const permissions = await loadMonitorPermissions({ userId, client });
  const [projects, sessions, attention, globalRule] = await Promise.all([
    client.from('projects').select('id, name, status, created_at, updated_at').eq('user_id', userId)
      .in('id', due.map((row) => row.project_id)).limit(MAX_BATCH),
    client.from('project_sessions').select('project_id, started_at, ended_at').eq('user_id', userId)
      .in('project_id', due.map((row) => row.project_id)).order('started_at', { ascending: false }).limit(300),
    loadRecentAttentionState({ userId, client, now: time }),
    client.from('brain_proactive_rules').select('enabled, quiet_hours_start, quiet_hours_end')
      .eq('user_id', userId).eq('rule_key', 'global').eq('channel', 'whatsapp').maybeSingle(),
  ]);
  for (const result of [projects, sessions, globalRule]) if (result.error) throw result.error;
  const byId = new Map((projects.data || []).map((row) => [row.id, row]));
  const candidates = [];
  const skipped = [];
  let checkedCount = 0;
  for (const monitor of due) {
    if (monitor.check_count >= monitor.max_checks || Date.parse(monitor.expires_at) <= time.getTime()
      || Date.parse(monitor.review_at) <= time.getTime()) {
      const state = Date.parse(monitor.expires_at) <= time.getTime() ? 'expired' : 'retired';
      if (!preview) await updateMonitorAfterCheck({ client, userId, monitor, now: time, state });
      skipped.push({ reason: state, monitor_id: monitor.id });
      continue;
    }
    const signal = evaluateProjectMonitorSignal({ monitor, project: byId.get(monitor.project_id),
      sessions: sessions.data || [], sessionHistoryTruncated: (sessions.data || []).length >= 300, now: time });
    let decision = decideAttention({ signal, permissions, recentEvents: attention.recentEvents,
      recentOutbox: attention.recentOutbox, now: time,
      quietStart: globalRule.data?.quiet_hours_start || '23:00',
      quietEnd: globalRule.data?.quiet_hours_end || '08:00',
      dismissalCount: Number(monitor.metadata?.dismissal_count) || 0 });
    if (monitor.permission_basis === 'standing_monitor' && !permissions.monitor) {
      decision = { ...decision, decision: 'silent', reason_code: 'monitor_permission_absent',
        cooldown_until: null, context_refs: [] };
    }
    if (decision.decision === 'message' && (globalRule.data?.enabled === false || !recipient)) {
      decision = { ...decision, decision: 'silent', reason_code: !recipient ? 'missing_recipient' : 'global_proactive_disabled',
        cooldown_until: null };
    }
    const eventKey = `monitor:${monitor.id}:${monitor.next_check_at}`;
    const recorded = preview ? null : await recordAttentionDecision({ userId, client, monitor, eventKey, decision, signal, now: time });
    if (preview || !recorded.duplicate) checkedCount++;
    if (!preview) await updateMonitorAfterCheck({ client, userId, monitor, now: time,
      state: signal.state === 'resolved' ? 'retired' : 'active', decision,
      quietStart: globalRule.data?.quiet_hours_start || '23:00',
      quietEnd: globalRule.data?.quiet_hours_end || '08:00' });
    if (decision.decision !== 'message' || (!preview && recorded.duplicate &&
      (recorded.event?.decision !== 'message' || recorded.event?.outbox_message_id))) {
      skipped.push({ reason: decision.reason_code,
        monitor_id: monitor.id, attention_event_id: recorded?.event?.id || null });
      continue;
    }
    const body = renderApprovedMonitorMessage({ monitor, signal, decision });
    if (!body) continue;
    candidates.push({
      channel: 'whatsapp', recipient, body, priority: 'low',
      rule_key: 'monitor_project_staleness', source_type: 'monitor', source_id: monitor.id,
      idempotency_key: eventKey, scheduled_for: time.toISOString(),
      expires_at: new Date(time.getTime() + 12 * 3600000).toISOString(),
      metadata: { created_by: 'brain_attention_engine_v1', monitor_id: monitor.id,
        ...(recorded?.event?.id ? { attention_event_id: recorded.event.id } : {}), expected_reply_type: 'monitor',
        proactive_trace: { rule_key: 'monitor_project_staleness', decision: 'candidate', reason_code: decision.reason_code } },
    });
  }
  return { candidates, skipped, checked_count: checkedCount };
}

export function nextMonitorCheckAt({ monitor, now = new Date(), decision = null,
  quietStart = '23:00', quietEnd = '08:00' } = {}) {
  const time = new Date(now);
  if (decision?.reason_code === 'quiet_hours') {
    return nextAvailableAttentionTime(time, quietStart, quietEnd).toISOString();
  }
  if (['topic_cooldown', 'global_cooldown'].includes(decision?.reason_code)
    && Date.parse(decision.cooldown_until) > time.getTime()) return decision.cooldown_until;
  return new Date(time.getTime() + monitor.cadence_minutes * 60000).toISOString();
}

async function updateMonitorAfterCheck({ client, userId, monitor, now, state, decision = null,
  quietStart = '23:00', quietEnd = '08:00' }) {
  const time = new Date(now);
  const updated = await client.from('brain_monitors').update({
    state, check_count: Number(monitor.check_count || 0) + 1, last_checked_at: time.toISOString(),
    next_check_at: nextMonitorCheckAt({ monitor, now: time, decision, quietStart, quietEnd }),
    updated_at: time.toISOString(),
  }).eq('user_id', userId).eq('id', monitor.id).eq('state', 'active')
    .eq('next_check_at', monitor.next_check_at).select('id').maybeSingle();
  if (updated.error) throw updated.error;
  return Boolean(updated.data);
}
