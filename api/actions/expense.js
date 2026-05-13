import { handleApiError, readJsonBody, requireActionAuth, requirePost, sendJson } from '../_utils/http.js';
import { getActionUserId, getSupabaseAdmin } from '../_utils/supabaseAdmin.js';
import { compactPayload, optionalDate, optionalText, requiredPositiveNumber, requiredText, today } from '../_utils/validation.js';

export default async function handler(req, res) {
  try {
    requireActionAuth(req);
    requirePost(req);

    const body = await readJsonBody(req);
    const userId = getActionUserId();
    const payload = compactPayload({
      user_id: userId,
      vendor: requiredText(body, 'vendor'),
      category: requiredText(body, 'category'),
      amount: requiredPositiveNumber(body, 'amount'),
      spent_on: optionalDate(body, 'spent_on', today()),
      notes: optionalText(body.notes),
    });

    const { data, error } = await getSupabaseAdmin()
      .from('expenses')
      .insert(payload)
      .select('id, user_id, vendor, category, amount, spent_on, notes, created_at, updated_at')
      .single();

    if (error) throw error;
    sendJson(res, 201, { data });
  } catch (error) {
    handleApiError(res, error);
  }
}
