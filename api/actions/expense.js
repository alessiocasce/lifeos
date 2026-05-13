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
import { compactPayload, optionalDate, optionalText, requiredNumber, requiredText, today } from '../_utils/validation.js';

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    requireActionAuth(req);

    const body = await readJsonBody(req);
    const userId = getActionUserId();
    const payload = compactPayload({
      user_id: userId,
      vendor: requiredText(body, 'vendor', { max: 120 }),
      category: requiredText(body, 'category', { max: 80 }),
      amount: requiredNumber(body, 'amount', { minExclusive: 0, max: 100000 }),
      spent_on: optionalDate(body, 'spent_on', today()),
      notes: optionalText(body.notes, 'notes', { max: 1000 }),
    });

    const { data, error } = await getSupabaseAdmin()
      .from('expenses')
      .insert(payload)
      .select('id, user_id, vendor, category, amount, spent_on, notes, created_at, updated_at')
      .single();

    if (error) throw error;
    sendSuccess(res, 201, data, context);
  } catch (error) {
    handleApiError(res, error, context);
  }
}
