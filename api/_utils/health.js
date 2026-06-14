import { addDays } from './date.js';

export function calculateSleepHoursFromTimes(previousSleepStart, wakeTime) {
  const startMinutes = parseCanonicalTime(previousSleepStart);
  const wakeMinutes = parseCanonicalTime(wakeTime);
  if (startMinutes === null || wakeMinutes === null) return null;

  let durationMinutes = wakeMinutes - startMinutes;
  if (durationMinutes <= 0) durationMinutes += 24 * 60;
  if (durationMinutes <= 0 || durationMinutes > 24 * 60) return null;

  return Math.round((durationMinutes / 60) * 2) / 2;
}

export async function recalculateSleepHoursForDate(client, userId, loggedOn) {
  const previousDate = addDays(loggedOn, -1);
  const [{ data: previous, error: previousError }, { data: current, error: currentError }] = await Promise.all([
    client
      .from('health_logs')
      .select('sleep_start')
      .eq('user_id', userId)
      .eq('logged_on', previousDate)
      .maybeSingle(),
    client
      .from('health_logs')
      .select('id, wake_time')
      .eq('user_id', userId)
      .eq('logged_on', loggedOn)
      .maybeSingle(),
  ]);
  if (previousError) throw previousError;
  if (currentError) throw currentError;
  if (!current) return null;

  const sleepHours = calculateSleepHoursFromTimes(previous?.sleep_start, current.wake_time);
  const { data, error } = await client
    .from('health_logs')
    .update({ sleep_hours: sleepHours })
    .eq('id', current.id)
    .eq('user_id', userId)
    .select('id, logged_on, sleep_hours, sleep_start, wake_time')
    .single();
  if (error) throw error;
  return data;
}

export async function recalculateSleepAfterHealthChange(client, userId, loggedOn, changedFields = []) {
  const changed = new Set(changedFields);
  const recalculated = [];
  if (changed.has('wake_time')) {
    const current = await recalculateSleepHoursForDate(client, userId, loggedOn);
    if (current) recalculated.push(current);
  }
  if (changed.has('sleep_start')) {
    const next = await recalculateSleepHoursForDate(client, userId, addDays(loggedOn, 1));
    if (next) recalculated.push(next);
  }
  return recalculated;
}

function parseCanonicalTime(value) {
  const match = String(value ?? '').match(/^(\d{2}):([0-5]\d)/);
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours < 0 || hours > 23) return null;
  return hours * 60 + Number(match[2]);
}
