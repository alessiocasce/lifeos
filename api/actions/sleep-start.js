import {
  HttpError,
  createRequestContext,
  handleApiError,
  handleOptions,
  readJsonBody,
  requireActionAuth,
  requirePost,
  sendSuccess,
} from '../_utils/http.js';
import { addDays, localDate } from '../_utils/date.js';
import { recalculateSleepHoursForDate } from '../_utils/health.js';
import { getActionUserId, getSupabaseAdmin } from '../_utils/supabaseAdmin.js';
import { optionalDate, optionalText, optionalTime } from '../_utils/validation.js';

const healthLogSelect = 'id, user_id, logged_on, sleep_hours, sleep_start, wake_time, sleep_quality, energy, coffee, water, adc, mood, social_time_minutes, main_time_waster, notes, hygiene, created_at, updated_at';

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    requireActionAuth(req);

    const body = await readJsonBody(req);
    const sleepStart = readSleepStart(body);
    const hasExplicitDate = body.logged_on !== undefined && body.logged_on !== null && body.logged_on !== '';
    const explicitLoggedOn = hasExplicitDate ? optionalDate(body, 'logged_on') : undefined;
    const loggedOn = resolveSleepStartLoggedOn(sleepStart, explicitLoggedOn);
    const notes = optionalText(body.notes, 'notes', { max: 1000 });
    const userId = getActionUserId();
    const supabase = getSupabaseAdmin();

    const { data: existing, error: readError } = await supabase
      .from('health_logs')
      .select('id, notes')
      .eq('user_id', userId)
      .eq('logged_on', loggedOn)
      .maybeSingle();
    if (readError) throw readError;

    const payload = { sleep_start: sleepStart };
    if (notes && !existing?.notes) payload.notes = notes;
    const query = existing
      ? supabase.from('health_logs').update(payload).eq('id', existing.id).eq('user_id', userId)
      : supabase.from('health_logs').insert({ user_id: userId, logged_on: loggedOn, ...payload });
    const { data: sleepLog, error } = await query.select(healthLogSelect).single();
    if (error) throw error;

    const nextDate = addDays(loggedOn, 1);
    const recalculated = await recalculateSleepHoursForDate(supabase, userId, nextDate);
    sendSuccess(res, 200, {
      health_log: sleepLog,
      sleep_start_logged_on: loggedOn,
      sleep_start: sleepStart,
      recalculated_date: recalculated?.wake_time ? nextDate : null,
      recalculated_sleep_hours: recalculated?.wake_time ? recalculated.sleep_hours : null,
    }, context);
  } catch (error) {
    handleApiError(res, error, context);
  }
}

function readSleepStart(body) {
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

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function resolveSleepStartLoggedOn(sleepStart, explicitLoggedOn) {
  if (explicitLoggedOn) return explicitLoggedOn;
  return localDate(timeToMinutes(sleepStart) < 12 * 60 ? -1 : 0);
}
