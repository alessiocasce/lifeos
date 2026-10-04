import { HttpError } from './http.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { getAllowedCanonicalWhatsappSenders } from './whatsappBridge.js';

export async function controlWorkoutRestTimer({ userId, body = {}, client = getSupabaseAdmin(), env = process.env }) {
  const operation = body.operation || 'status';
  if (!['status', 'configure', 'schedule', 'cancel'].includes(operation)) throw new HttpError(400, 'Invalid rest timer operation.');
  // Never accept destination, copy, metadata or user identity from the browser.
  let recipient = null;
  if (operation === 'schedule' || (operation === 'configure' && body.enabled === true)) {
    const recipients = [...getAllowedCanonicalWhatsappSenders(env)].filter((id) => !id.endsWith('@g.us'));
    if (recipients.length !== 1) throw new HttpError(409, 'Rest timer requires one configured personal WhatsApp destination.');
    [recipient] = recipients;
  }
  if (operation === 'configure' && (typeof body.enabled !== 'boolean' || !Number.isInteger(body.duration_seconds)
    || body.duration_seconds < 15 || body.duration_seconds > 900)) throw new HttpError(400, 'Rest duration must be 15–900 seconds.');
  if (operation === 'schedule' && !/^[0-9a-f-]{36}$/i.test(body.set_id || '')) throw new HttpError(400, 'Saved set is required.');
  const result = await client.rpc('control_workout_rest_timer', {
    p_user_id: userId, p_operation: operation, p_recipient: recipient,
    p_set_id: operation === 'schedule' ? body.set_id : null,
    p_enabled: operation === 'configure' ? body.enabled : null,
    p_duration: operation === 'configure' ? body.duration_seconds : null,
  });
  if (result.error) throw new HttpError(409, 'Rest timer unavailable. Your workout set remains saved.');
  const data = result.data;
  return { preferences: data.preferences, timer: data.timer ? {
    id: data.timer.id, status: data.timer.status, scheduled_for: data.timer.scheduled_for,
    expires_at: data.timer.expires_at, ...data.timer.metadata?.workout_rest,
  } : null };
}
