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
import { getActionUserId, getSupabaseAdmin } from '../_utils/supabaseAdmin.js';
import { assertTimeOrder, compactPayload, optionalNullableTime, optionalText, requiredDate, requiredText } from '../_utils/validation.js';

const VALID_STATUSES = new Set(['planned', 'done', 'skipped', 'cancelled']);

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    requireActionAuth(req);

    const body = await readJsonBody(req);
    const status = body.status === undefined || body.status === null || body.status === ''
      ? 'planned'
      : String(body.status).trim();
    if (!VALID_STATUSES.has(status)) {
      throw new HttpError(400, 'status must be planned, done, skipped, or cancelled.');
    }

    const userId = getActionUserId();
    const startTime = optionalNullableTime(body, 'start_time');
    const endTime = optionalNullableTime(body, 'end_time');
    assertTimeOrder(startTime, endTime);

    const payload = compactPayload({
      user_id: userId,
      title: requiredText(body, 'title', { max: 160 }),
      event_date: requiredDate(body, 'event_date'),
      start_time: startTime,
      end_time: endTime,
      category: optionalText(body.category, 'category', { max: 80 }),
      location: optionalText(body.location, 'location', { max: 200 }),
      notes: optionalText(body.notes, 'notes', { max: 2000 }),
      status,
    });

    const { data, error } = await getSupabaseAdmin()
      .from('calendar_events')
      .insert(payload)
      .select('id, user_id, title, event_date, start_time, end_time, category, location, notes, status, created_at, updated_at')
      .single();

    if (error) throw error;
    sendSuccess(res, 201, data, context);
  } catch (error) {
    handleApiError(res, error, context);
  }
}
