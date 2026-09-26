import { TIME_ZONE, startOfLocalDayUtcIso } from './date.js';
import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';

const DEFAULT_QUIET_START = '23:00';
const DEFAULT_QUIET_END = '08:00';
const DAY_MS = 86400000;

export function decideAttention({ signal, permissions, recentEvents = [], recentOutbox = [], now = new Date(),
  quietStart = DEFAULT_QUIET_START, quietEnd = DEFAULT_QUIET_END, dismissalCount = 0 } = {}) {
  const time = new Date(now);
  const importance = Math.max(0, Math.min(5, Number(signal?.importance) || 0));
  const confidence = Math.max(0, Math.min(1, Number(signal?.confidence) || 0));
  const topic = String(signal?.topic_key || '').slice(0, 180);
  const base = { decision: 'silent', reason_code: 'no_signal', importance, confidence, topic, cooldown_until: null, context_refs: [] };
  if (!topic || signal?.state !== 'stale') return { ...base, reason_code: signal?.state === 'resolved' ? 'condition_resolved' : 'no_meaningful_change' };
  if (importance < 3) return { ...base, reason_code: 'low_importance' };
  if (confidence < 0.8) return { ...base, reason_code: 'low_confidence' };
  if (!permissions?.message) return { ...base, reason_code: 'message_permission_absent' };
  if (isAttentionQuietHour(time, quietStart, quietEnd)) return { ...base, reason_code: 'quiet_hours' };
  if (dismissalCount >= 2) return { ...base, reason_code: 'repeated_dismissal' };
  const messages = recentEvents.filter((event) => event.decision === 'message' && event.outbox_message_id);
  const sameTopic = messages.filter((event) => event.topic_key === topic);
  const lastTopic = sameTopic[0];
  if (lastTopic) {
    const cooldownUntil = new Date(Date.parse(lastTopic.created_at) + 7 * DAY_MS);
    if (cooldownUntil > time) return { ...base, reason_code: 'topic_cooldown', cooldown_until: cooldownUntil.toISOString() };
  }
  const unanswered = recentOutbox.filter((row) => row.source_type === 'monitor' && row.source_id === signal.monitor_id
    && row.status === 'sent' && !row.metadata?.resolution
    && Date.parse(row.sent_at || row.created_at) > time.getTime() - 30 * DAY_MS);
  if (unanswered.length >= 2) return { ...base, reason_code: 'unanswered_suppression' };
  const localStart = Date.parse(startOfLocalDayUtcIso(time));
  const todayMessages = recentOutbox.filter((row) => ['queued', 'claimed', 'sent'].includes(row.status)
    && Date.parse(row.created_at) >= localStart);
  if (todayMessages.length >= 3) return { ...base, reason_code: 'daily_interruption_cap' };
  const latest = todayMessages.reduce((max, row) => Math.max(max, Date.parse(row.created_at) || 0), 0);
  if (latest && time.getTime() - latest < 2 * 3600000) {
    return { ...base, reason_code: 'global_cooldown', cooldown_until: new Date(latest + 2 * 3600000).toISOString() };
  }
  return { ...base, decision: 'message', reason_code: 'stale_project_high_confidence',
    cooldown_until: new Date(time.getTime() + 7 * DAY_MS).toISOString(),
    context_refs: [{ type: 'project', id: signal.project_id }] };
}

export function decideAccountabilityAttention({ candidate, now = new Date(), dailyCount = 0, recentRows = [],
  quietStart = DEFAULT_QUIET_START, quietEnd = DEFAULT_QUIET_END } = {}) {
  const time = new Date(now);
  const base = { decision: 'message', reason_code: 'accountability_allowed', importance: 2, confidence: 0.8,
    topic: `accountability:${candidate?.rule_key || 'unknown'}`, cooldown_until: null, context_refs: [] };
  if (isAttentionQuietHour(time, quietStart, quietEnd)) return { ...base, decision: 'silent', reason_code: 'quiet_hours' };
  if (dailyCount >= 4) return { ...base, decision: 'silent', reason_code: 'daily_interruption_cap' };
  const recent = recentRows.filter((row) => ['queued', 'claimed', 'sent'].includes(row.status));
  const dismissals = recentRows.filter((row) => row.rule_key === candidate.rule_key
    && ['no', 'unknown', 'later'].includes(row.metadata?.resolution?.type));
  if (dismissals.length >= 2) return { ...base, decision: 'silent', reason_code: 'repeated_dismissal' };
  const latest = recent.reduce((max, row) => Math.max(max, Date.parse(row.created_at) || 0), 0);
  if (latest && time.getTime() - latest < 90 * 60000) {
    return { ...base, decision: 'silent', reason_code: 'global_cooldown', cooldown_until: new Date(latest + 90 * 60000).toISOString() };
  }
  const unanswered = recent.filter((row) => row.rule_key === candidate.rule_key && row.status === 'sent'
    && !row.metadata?.resolution
    && Date.parse(row.sent_at || row.created_at) > time.getTime() - 7 * DAY_MS);
  if (unanswered.length >= 2) return { ...base, decision: 'silent', reason_code: 'unanswered_suppression' };
  return base;
}

export function isAttentionQuietHour(now = new Date(), start = DEFAULT_QUIET_START, end = DEFAULT_QUIET_END) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE,
    hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now)
    .filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const clock = Number(parts.hour) * 60 + Number(parts.minute);
  const [sh, sm] = /^\d{2}:\d{2}/.test(start) ? start.split(':').map(Number) : [23, 0];
  const [eh, em] = /^\d{2}:\d{2}/.test(end) ? end.split(':').map(Number) : [8, 0];
  const from = sh * 60 + sm;
  const to = eh * 60 + em;
  return from === to ? false : from < to ? clock >= from && clock < to : clock >= from || clock < to;
}

export function nextAvailableAttentionTime(now = new Date(), start = DEFAULT_QUIET_START, end = DEFAULT_QUIET_END) {
  const time = new Date(now);
  if (!isAttentionQuietHour(time, start, end)) return time;
  for (let minutes = 15; minutes <= 24 * 60; minutes += 15) {
    const candidate = new Date(time.getTime() + minutes * 60000);
    if (!isAttentionQuietHour(candidate, start, end)) return candidate;
  }
  return new Date(time.getTime() + 24 * 3600000);
}

export async function loadRecentAttentionState({ userId = getActionUserId(), client = getSupabaseAdmin(), now = new Date() } = {}) {
  const since = new Date(new Date(now).getTime() - 30 * DAY_MS).toISOString();
  const [events, outbox] = await Promise.all([
    client.from('brain_attention_events').select('id, topic_key, decision, reason_code, outbox_message_id, created_at')
      .eq('user_id', userId).gte('created_at', since).order('created_at', { ascending: false }).limit(100),
    client.from('brain_outbox_messages').select('id, source_type, source_id, status, metadata, created_at, sent_at')
      .eq('user_id', userId).eq('channel', 'whatsapp').gte('created_at', since)
      .order('created_at', { ascending: false }).limit(100),
  ]);
  if (events.error) throw events.error;
  if (outbox.error) throw outbox.error;
  return { recentEvents: events.data || [], recentOutbox: outbox.data || [] };
}

export async function recordAttentionDecision({ userId = getActionUserId(), client = getSupabaseAdmin(),
  monitor = null, candidate = null, eventKey, decision, signal, now = new Date() } = {}) {
  const row = {
    user_id: userId, monitor_id: monitor?.id || null, event_key: eventKey,
    source_type: monitor ? 'monitor' : 'accountability',
    source_id: monitor?.id || candidate?.source_id,
    topic_key: monitor?.topic_key || `accountability:${candidate?.rule_key || 'unknown'}`,
    decision: decision.decision,
    reason_code: decision.reason_code, importance: decision.importance, confidence: decision.confidence,
    channel: decision.decision === 'message' ? 'whatsapp' : null,
    cooldown_until: decision.cooldown_until, metadata: {
      signal_state: signal?.state || null, observed_activity_at: signal?.last_activity_at || null,
    }, created_at: new Date(now).toISOString(),
  };
  const inserted = await client.from('brain_attention_events').insert(row).select().single();
  if (inserted.error?.code === '23505') {
    const prior = await client.from('brain_attention_events').select().eq('user_id', userId).eq('event_key', eventKey).maybeSingle();
    if (prior.error) throw prior.error;
    if (prior.data?.decision === 'silent' && decision.decision === 'message' && !prior.data.outbox_message_id) {
      const promoted = await client.from('brain_attention_events').update({
        decision: 'message', reason_code: decision.reason_code, importance: decision.importance,
        confidence: decision.confidence, channel: 'whatsapp', cooldown_until: decision.cooldown_until,
      }).eq('user_id', userId).eq('id', prior.data.id).eq('decision', 'silent')
        .is('outbox_message_id', null).select().maybeSingle();
      if (promoted.error) throw promoted.error;
      if (promoted.data) return { duplicate: false, event: promoted.data };
    }
    return { duplicate: true, event: prior.data };
  }
  if (inserted.error) throw inserted.error;
  return { duplicate: false, event: inserted.data };
}

export async function recordAttentionOutbox({ eventId, outboxId, monitorId = null, userId = getActionUserId(), client = getSupabaseAdmin(), now = new Date() } = {}) {
  if (!eventId || !outboxId) return;
  const updated = await client.from('brain_attention_events').update({ outbox_message_id: outboxId })
    .eq('user_id', userId).eq('id', eventId).select('id').maybeSingle();
  if (updated.error) throw updated.error;
  if (monitorId) {
    const triggered = await client.from('brain_monitors').update({ last_triggered_at: new Date(now).toISOString() })
      .eq('user_id', userId).eq('id', monitorId).eq('state', 'active');
    if (triggered.error) throw triggered.error;
  }
}

export async function recordAttentionSuppression({ eventId, reason, userId = getActionUserId(), client = getSupabaseAdmin() } = {}) {
  if (!eventId) return;
  const updated = await client.from('brain_attention_events').update({ decision: 'silent',
    reason_code: String(reason || 'candidate_suppressed').slice(0, 80), channel: null, cooldown_until: null })
    .eq('user_id', userId).eq('id', eventId).is('outbox_message_id', null);
  if (updated.error) throw updated.error;
}
