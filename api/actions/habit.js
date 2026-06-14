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
import { localDate, localTime } from '../_utils/date.js';
import { applyHabitUpdate, normalizeHabitId } from '../_utils/habits.js';
import { getActionUserId, getSupabaseAdmin } from '../_utils/supabaseAdmin.js';
import { optionalDate, optionalInteger, optionalTime } from '../_utils/validation.js';

const healthLogSelect = 'id, user_id, logged_on, sleep_hours, sleep_start, wake_time, sleep_quality, energy, coffee, water, adc, mood, social_time_minutes, main_time_waster, notes, hygiene, created_at, updated_at';

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    requireActionAuth(req);

    const body = await readJsonBody(req);
    const habit = normalizeHabitId(body.habit);
    if (!habit) throw new HttpError(400, 'habit must be one of shower, creatine, skin.');
    const loggedOn = optionalDate(body, 'logged_on', localDate());
    const time = readHabitTime(body);
    const amount = optionalInteger(body, 'amount', { min: 0, max: 100 }) ?? 1;
    const mode = String(body.mode ?? 'increment').trim().toLowerCase();
    if (!['increment', 'set'].includes(mode)) {
      throw new HttpError(400, 'mode must be increment or set.');
    }

    const userId = getActionUserId();
    const supabase = getSupabaseAdmin();
    const { data: existing, error: readError } = await supabase
      .from('health_logs')
      .select('id, hygiene')
      .eq('user_id', userId)
      .eq('logged_on', loggedOn)
      .maybeSingle();
    if (readError) throw readError;

    const hygiene = applyHabitUpdate(existing?.hygiene, { habit, amount, mode, time });
    const query = existing
      ? supabase.from('health_logs').update({ hygiene }).eq('id', existing.id).eq('user_id', userId)
      : supabase.from('health_logs').insert({ user_id: userId, logged_on: loggedOn, hygiene });
    const { data, error } = await query.select(healthLogSelect).single();
    if (error) throw error;

    sendSuccess(res, 200, {
      health_log: data,
      habit,
      logged_on: loggedOn,
      time,
      mode,
      amount,
      entry: hygiene[habit],
    }, context);
  } catch (error) {
    handleApiError(res, error, context);
  }
}

function readHabitTime(body) {
  if (body.time === undefined || body.time === null || body.time === '') return localTime();
  try {
    return optionalTime({ time: body.time }, 'time');
  } catch {
    throw new HttpError(400, 'time must be a valid habit time such as 09:37.');
  }
}
