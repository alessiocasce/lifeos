import { createClient } from '@supabase/supabase-js';
import { HttpError } from './http.js';

let adminClient = null;

export function getActionUserId() {
  const userId = String(process.env.LIFEOS_ACTION_USER_ID ?? '').trim();
  if (!userId) {
    throw new HttpError(500, 'Action API user id is not configured.');
  }
  if (!isUuid(userId)) {
    throw new HttpError(500, 'Action API user id is not a valid UUID.');
  }
  return userId;
}

export function getSupabaseAdmin() {
  const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!supabaseUrl) {
    throw new HttpError(500, 'Supabase server URL is not configured.');
  }
  if (!isHttpUrl(supabaseUrl)) {
    throw new HttpError(500, 'Supabase server URL is invalid.');
  }
  if (!serviceRoleKey) {
    throw new HttpError(500, 'Supabase service-role key is not configured.');
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

export async function requireConfiguredUserAccess(accessToken) {
  if (!accessToken) {
    throw new HttpError(401, 'Unauthorized.');
  }

  const actionUserId = getActionUserId();
  const { data, error } = await getSupabaseAdmin().auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new HttpError(401, 'Unauthorized.');
  }
  if (data.user.id !== actionUserId) {
    throw new HttpError(403, 'This assistant is not configured for the signed-in user.');
  }
  return data.user;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
