import { handleApiError, readJsonBody, requireActionAuth, requirePost, sendJson } from '../_utils/http.js';
import { getActionUserId, getSupabaseAdmin } from '../_utils/supabaseAdmin.js';
import {
  compactPayload,
  optionalDate,
  optionalInteger,
  optionalNumber,
  optionalText,
  optionalTime,
  today,
} from '../_utils/validation.js';

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
  try {
    requireActionAuth(req);
    requirePost(req);

    const body = await readJsonBody(req);
    const userId = getActionUserId();
    const payload = compactPayload({
      user_id: userId,
      logged_on: optionalDate(body, 'logged_on', today()),
      sleep_hours: optionalNumber(body, 'sleep_hours', { min: 0, max: 24 }),
      sleep_start: optionalTime(body, 'sleep_start'),
      wake_time: optionalTime(body, 'wake_time'),
      energy: optionalInteger(body, 'energy', { min: 1, max: 10 }),
      water: optionalInteger(body, 'water', { min: 0 }),
      coffee: optionalInteger(body, 'coffee', { min: 0 }),
      adc: optionalInteger(body, 'adc', { min: 0 }),
      notes: optionalText(body.notes),
    });

    const { data, error } = await getSupabaseAdmin()
      .from('health_logs')
      .upsert(payload, { onConflict: 'user_id,logged_on' })
      .select(healthLogSelect)
      .single();

    if (error) throw error;
    sendJson(res, 200, { data });
  } catch (error) {
    handleApiError(res, error);
  }
}
