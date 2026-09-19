import { getHabitEntry, normalizeHygieneObject } from './habits.js';
import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import { recalculateSleepHoursForDate } from './health.js';
import { addDays } from './date.js';
import { evaluateRoutineProactivePolicy, getCurrentRoutineBelief } from './brainBeliefs.js';

export function accountabilitySatisfied(target, health) {
  if (target?.kind === 'habit_missing') return getHabitEntry(health?.hygiene, target.habit_id).count >= (target.target_count || 1);
  if (target?.kind === 'wake_time_missing') return Boolean(health?.wake_time);
  if (target?.kind === 'sleep_start_missing') return Boolean(health?.sleep_start);
  return false;
}

export async function sourceIsResolved({ client, userId, sourceId, sourceType }) {
  const result = await client.from('brain_outbox_messages').select('id')
    .eq('user_id', userId).eq('source_type', sourceType).eq('source_id', sourceId)
    .contains('metadata', { resolution: { source_closed: true } }).limit(1).maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data);
}

export async function checkProactiveDelivery({ row, client = getSupabaseAdmin(), userId = getActionUserId() }) {
  if (row.source_type === 'memo') {
    const result = await client.from('memos').select('id,status,memo_date,memo_time')
      .eq('user_id', userId).eq('id', row.source_id).maybeSingle();
    if (result.error) throw result.error;
    const memo = result.data;
    const snapshot = row.metadata?.memo;
    const changed = snapshot && (snapshot.memo_date !== memo?.memo_date || (snapshot.memo_time || '').slice(0, 5) !== (memo?.memo_time || '').slice(0, 5));
    return { eligible: Boolean(memo?.status === 'open' && !changed), reason: changed ? 'memo_rescheduled' : 'memo_not_open' };
  }
  if (row.source_type !== 'accountability') return { eligible: true };
  const target = row.metadata?.accountability;
  if (!['habit_missing', 'wake_time_missing', 'sleep_start_missing'].includes(target?.kind)
    || !/^\d{4}-\d{2}-\d{2}$/.test(target.sleep_date || target.local_date || '')
    || (target.kind === 'habit_missing' && !['shower', 'creatine', 'skin'].includes(target.habit_id))) {
    return { eligible: false, reason: 'invalid_target' };
  }
  if (await sourceIsResolved({ client, userId, sourceId: row.source_id, sourceType: row.source_type })) return { eligible: false, reason: 'source_resolved' };
  if (target.kind === 'habit_missing') {
    const belief = await getCurrentRoutineBelief({ routineId: target.habit_id, userId, client });
    const routinePolicy = evaluateRoutineProactivePolicy(belief);
    if (!routinePolicy.allowed || routinePolicy.mode !== 'normal') {
      return { eligible: false, reason: routinePolicy.reason || 'routine_not_active' };
    }
  }
  const result = await client.from('health_logs').select('hygiene,wake_time,sleep_start')
    .eq('user_id', userId).eq('logged_on', target.sleep_date || target.local_date).maybeSingle();
  if (result.error) throw result.error;
  return { eligible: !accountabilitySatisfied(target, result.data), reason: 'health_target_satisfied' };
}

// Compare-and-swap protects ensure-target replies from concurrent increments. A retry
// rereads current state instead of overwriting another interface's health changes.
export async function ensureAccountabilityHealth(args, { client = getSupabaseAdmin(), userId = getActionUserId() } = {}) {
  const date = args.logged_on || args.loggedOn;
  const habit = ['shower', 'creatine', 'skin'].find((id) => args[id] === true);
  const field = args.time ? 'sleep_start' : 'wake_time';
  const time = args.time || args.wake_time;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || (!habit && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || ''))) throw new Error('Invalid accountability health target.');
  for (let attempt = 0; attempt < 4; attempt++) {
    const read = await client.from('health_logs').select('*').eq('user_id', userId).eq('logged_on', date).maybeSingle();
    if (read.error) throw read.error;
    const current = read.data;
    const entry = getHabitEntry(current?.hygiene, habit);
    const target = Math.max(1, Number(args.target_count) || 1);
    const satisfied = habit ? entry.count >= target : Boolean(current?.[field]);
    if (satisfied) {
      if (!habit) await recalculateSleepHoursForDate(client, userId, field === 'sleep_start' ? addDays(date, 1) : date);
      return { ...current, accountability_noop: true };
    }
    const patch = habit ? { hygiene: { ...normalizeHygieneObject(current?.hygiene), [habit]: {
      count: target, times: [...entry.times, args.habit_time].filter(Boolean),
    } } } : { [field]: time };
    const query = current
      ? client.from('health_logs').update(patch).eq('user_id', userId).eq('id', current.id).eq('updated_at', current.updated_at)
      : client.from('health_logs').insert({ user_id: userId, logged_on: date, ...patch });
    const saved = await query.select('*').maybeSingle();
    if (saved.error && saved.error.code !== '23505') throw saved.error;
    if (saved.data) {
      if (!habit) await recalculateSleepHoursForDate(client, userId, field === 'sleep_start' ? addDays(date, 1) : date);
      return saved.data;
    }
  }
  throw new Error('Health changed concurrently. Please try again.');
}

export async function resolveAccountabilityTarget({ proactive, resolution, preserveId = null, client = getSupabaseAdmin(), userId = getActionUserId() }) {
  if (!proactive.outbox_message_id) throw new Error('Missing persisted proactive target.');
  const read = await client.from('brain_outbox_messages').select('id,metadata')
    .eq('user_id', userId).eq('id', proactive.outbox_message_id).maybeSingle();
  if (read.error) throw read.error;
  if (!read.data) throw new Error('Proactive target no longer exists.');
  const marker = { type: resolution, resolved_at: new Date().toISOString(), source_closed: ['done', 'time', 'no_sleep'].includes(resolution) };
  const updated = await client.from('brain_outbox_messages').update({ metadata: { ...read.data.metadata, resolution: marker } })
    .eq('user_id', userId).eq('id', read.data.id);
  if (updated.error) throw updated.error;
  if (marker.source_closed || resolution === 'snooze') {
    let cancel = client.from('brain_outbox_messages').update({ status: 'cancelled' }).eq('user_id', userId)
      .eq('source_type', 'accountability').eq('source_id', proactive.source_id).eq('status', 'queued');
    if (preserveId) cancel = cancel.neq('id', preserveId);
    const result = await cancel;
    if (result.error) throw result.error;
  }
  const messages = await client.from('ai_chat_messages').select('id,metadata').eq('user_id', userId)
    .contains('metadata', { outbox_message_id: proactive.outbox_message_id }).limit(20);
  if (messages.error) throw messages.error;
  for (const message of messages.data || []) {
    const result = await client.from('ai_chat_messages').update({ metadata: { ...message.metadata, proactive_resolution: marker } }).eq('user_id', userId).eq('id', message.id);
    if (result.error) throw result.error;
  }
}

export async function accountabilityTargetIsResolved(proactive, { client = getSupabaseAdmin(), userId = getActionUserId() } = {}) {
  const read = await client.from('brain_outbox_messages').select('status,metadata').eq('user_id', userId).eq('id', proactive.outbox_message_id).maybeSingle();
  if (read.error) throw read.error;
  if (!read.data || read.data.status !== 'sent') throw new Error('No delivered accountability target.');
  return Boolean(read.data.metadata?.resolution) || sourceIsResolved({ client, userId, sourceId: proactive.source_id, sourceType: 'accountability' });
}
