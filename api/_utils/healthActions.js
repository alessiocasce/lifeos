import { HttpError } from './http.js';
import { addDays, localDate } from './date.js';
import { recalculateSleepHoursForDate } from './health.js';
import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import { optionalDate, optionalText, optionalTime } from './validation.js';

export const HEALTH_LOG_SELECT = 'id, user_id, logged_on, sleep_hours, sleep_start, wake_time, sleep_quality, energy, coffee, water, adc, mood, social_time_minutes, main_time_waster, notes, hygiene, created_at, updated_at';

export function readSleepStartTime(body = {}) {
  const value = body.time ?? body.sleep_start ?? body.sleepStart;
  if (value === undefined || value === null || value === '') {
    throw new HttpError(400, 'time is required.');
  }
  try {
    return optionalTime({ sleep_start: value }, 'sleep_start');
  } catch {
    throw new HttpError(400, 'time must be a valid sleep start time such as 01:30.');
  }
}

export function readSleepStartLoggedOn(body = {}, sleepStart) {
  const hasExplicitDate = body.logged_on !== undefined && body.logged_on !== null && body.logged_on !== '';
  const explicitLoggedOn = hasExplicitDate ? optionalDate(body, 'logged_on') : undefined;
  return resolveSleepStartLoggedOn(sleepStart, explicitLoggedOn);
}

export function resolveSleepStartLoggedOn(sleepStart, explicitLoggedOn) {
  if (explicitLoggedOn) return explicitLoggedOn;
  return localDate(timeToMinutes(sleepStart) < 12 * 60 ? -1 : 0);
}

export async function logSleepStart({ time, loggedOn, notes, userId = getActionUserId(), supabase = getSupabaseAdmin() } = {}) {
  const sleepStart = readSleepStartTime({ time });
  const sleepStartLoggedOn = resolveSleepStartLoggedOn(sleepStart, loggedOn);
  const note = optionalText(notes, 'notes', { max: 1000 });

  const { data: existing, error: readError } = await supabase
    .from('health_logs')
    .select('id, notes')
    .eq('user_id', userId)
    .eq('logged_on', sleepStartLoggedOn)
    .maybeSingle();
  if (readError) throw readError;

  const payload = { sleep_start: sleepStart };
  if (note && !existing?.notes) payload.notes = note;
  const query = existing
    ? supabase.from('health_logs').update(payload).eq('id', existing.id).eq('user_id', userId)
    : supabase.from('health_logs').insert({ user_id: userId, logged_on: sleepStartLoggedOn, ...payload });

  const { data: sleepLog, error } = await query.select(HEALTH_LOG_SELECT).single();
  if (error) throw error;

  const nextDate = addDays(sleepStartLoggedOn, 1);
  const recalculated = await recalculateSleepHoursForDate(supabase, userId, nextDate);
  return {
    health_log: sleepLog,
    sleep_start_logged_on: sleepStartLoggedOn,
    sleep_start: sleepStart,
    recalculated_date: recalculated?.wake_time ? nextDate : null,
    recalculated_sleep_hours: recalculated?.wake_time ? recalculated.sleep_hours : null,
  };
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
