import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';

export const MONITOR_PERMISSION_KEYS = Object.freeze(['monitor', 'message']);

export function normalizeMonitorPermissions(rows = []) {
  const result = { observe: true, remember: true, monitor: false, message: false };
  for (const row of rows) {
    if (row?.subject_type !== 'companion_permission' || row?.predicate !== 'grant' || row?.record_status !== 'current') continue;
    const key = String(row.subject_key || '').replace(/^companion\./, '');
    if (!MONITOR_PERMISSION_KEYS.includes(key)) continue;
    if (!['user_explicit', 'external_sync', 'manual'].includes(row.source_type)) continue;
    result[key] = row.value?.enabled === true && Number(row.confidence) >= 0.8;
  }
  return result;
}

export async function loadMonitorPermissions({ userId = getActionUserId(), client = getSupabaseAdmin() } = {}) {
  const result = await client.from('brain_beliefs')
    .select('subject_type, subject_key, predicate, record_status, value, source_type, confidence')
    .eq('user_id', userId).eq('subject_type', 'companion_permission')
    .eq('predicate', 'grant').eq('record_status', 'current').limit(4);
  if (result.error) throw result.error;
  return normalizeMonitorPermissions(result.data || []);
}
