import { HttpError, handleApiError, readJsonBody, requireActionAuth, requirePost, sendJson } from '../_utils/http.js';
import { getActionUserId, getSupabaseAdmin } from '../_utils/supabaseAdmin.js';
import { compactPayload, optionalText, optionalTime, requiredDate, requiredText } from '../_utils/validation.js';

const VALID_STATUSES = new Set(['planned', 'done', 'skipped', 'cancelled']);

export default async function handler(req, res) {
  try {
    requireActionAuth(req);
    requirePost(req);

    const body = await readJsonBody(req);
    const status = body.status === undefined || body.status === null || body.status === ''
      ? 'planned'
      : String(body.status).trim();
    if (!VALID_STATUSES.has(status)) {
      throw new HttpError(400, 'status must be planned, done, skipped, or cancelled.');
    }

    const userId = getActionUserId();
    const payload = compactPayload({
      user_id: userId,
      title: requiredText(body, 'title'),
      event_date: requiredDate(body, 'event_date'),
      start_time: optionalTime(body, 'start_time'),
      end_time: optionalTime(body, 'end_time'),
      category: optionalText(body.category),
      location: optionalText(body.location),
      notes: optionalText(body.notes),
      status,
    });

    const { data, error } = await getSupabaseAdmin()
      .from('calendar_events')
      .insert(payload)
      .select('id, user_id, title, event_date, start_time, end_time, category, location, notes, status, created_at, updated_at')
      .single();

    if (error) throw error;
    sendJson(res, 201, { data });
  } catch (error) {
    handleApiError(res, error);
  }
}
