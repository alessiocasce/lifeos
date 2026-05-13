import { createClient } from '@supabase/supabase-js';
import { HttpError } from './http.js';

let adminClient = null;

export function getActionUserId() {
  const userId = process.env.LIFEOS_ACTION_USER_ID;
  if (!userId) {
    throw new HttpError(500, 'Action API user id is not configured.');
  }
  return userId;
}

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new HttpError(500, 'Supabase server credentials are not configured.');
  }

  if (!adminClient) {
    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminClient;
}
