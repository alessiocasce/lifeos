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
import { localDate } from '../_utils/lifeosTools.js';
import { getActionUserId, getSupabaseAdmin } from '../_utils/supabaseAdmin.js';
import { optionalDate, optionalText, optionalTime } from '../_utils/validation.js';

const healthLogSelect = `
  id,
  user_id,
  logged_on,
  sleep_hours,
  sleep_start,
  wake_time,
  sleep_quality,
  energy,
  coffee,
  water,
  adc,
  mood,
  social_time_minutes,
  main_time_waster,
  notes,
  hygiene,
  created_at,
  updated_at
`;

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    requireActionAuth(req);

    const body = await readJsonBody(req);
    const userId = getActionUserId();
    const loggedOn = optionalDate(body, 'logged_on', localDate());
    const wakeTime = readWakeTime(body);
    const notes = optionalText(body.notes, 'notes', { max: 1000 });
    const supabase = getSupabaseAdmin();

    const { data: existing, error: readError } = await supabase
      .from('health_logs')
      .select('id, notes')
      .eq('user_id', userId)
      .eq('logged_on', loggedOn)
      .maybeSingle();
    if (readError) throw readError;

    let query;
    if (existing) {
      const payload = { wake_time: wakeTime };
      if (notes && !existing.notes) payload.notes = notes;
      query = supabase
        .from('health_logs')
        .update(payload)
        .eq('id', existing.id)
        .eq('user_id', userId);
    } else {
      query = supabase
        .from('health_logs')
        .insert({
          user_id: userId,
          logged_on: loggedOn,
          wake_time: wakeTime,
          ...(notes ? { notes } : {}),
        });
    }

    const { data, error } = await query
      .select(healthLogSelect)
      .single();
    if (error) throw error;

    sendSuccess(res, 200, data, context);
  } catch (error) {
    handleApiError(res, error, context);
  }
}

function readWakeTime(body) {
  const value = body.time ?? body.wake_time ?? body.wakeTime;
  if (value === undefined || value === null || value === '') {
    throw new HttpError(400, 'time is required.');
  }
  try {
    return optionalTime({ wake_time: value }, 'wake_time');
  } catch {
    throw new HttpError(400, 'time must be a valid wake time such as 08:37.');
  }
}
