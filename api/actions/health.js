import {
  createRequestContext,
  handleApiError,
  handleOptions,
  readJsonBody,
  requireActionAuth,
  requirePost,
  sendSuccess,
} from '../_utils/http.js';
import { getActionUserId, getSupabaseAdmin } from '../_utils/supabaseAdmin.js';
import { recalculateSleepAfterHealthChange } from '../_utils/health.js';
import {
  compactPayload,
  optionalDate,
  optionalInteger,
  optionalNullableInteger,
  optionalNullableNumber,
  optionalNullableTime,
  optionalText,
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
  const context = createRequestContext(req, res);
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    requireActionAuth(req);

    const body = await readJsonBody(req);
    const userId = getActionUserId();
    const client = getSupabaseAdmin();
    const payload = compactPayload({
      user_id: userId,
      logged_on: optionalDate(body, 'logged_on', today()),
      sleep_hours: optionalNullableNumber(body, 'sleep_hours', { min: 0, max: 24 }),
      sleep_start: optionalNullableTime(body, 'sleep_start'),
      wake_time: optionalNullableTime(body, 'wake_time'),
      energy: optionalNullableInteger(body, 'energy', { min: 1, max: 10 }),
      water: optionalInteger(body, 'water', { min: 0, max: 100 }),
      coffee: optionalInteger(body, 'coffee', { min: 0, max: 100 }),
      adc: optionalInteger(body, 'adc', { min: 0, max: 100 }),
      notes: optionalText(body.notes, 'notes', { max: 2000 }),
    });

    const changedFields = Object.keys(payload).filter((key) => !['user_id', 'logged_on'].includes(key));
    const { data, error } = await client
      .from('health_logs')
      .upsert(payload, { onConflict: 'user_id,logged_on' })
      .select(healthLogSelect)
      .single();

    if (error) throw error;
    await recalculateSleepAfterHealthChange(client, userId, payload.logged_on, changedFields);
    const { data: refreshed, error: refreshError } = await client
      .from('health_logs')
      .select(healthLogSelect)
      .eq('id', data.id)
      .single();
    if (refreshError) throw refreshError;
    sendSuccess(res, 200, refreshed, context);
  } catch (error) {
    handleApiError(res, error, context);
  }
}
