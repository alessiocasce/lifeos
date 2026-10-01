import { HttpError } from './http.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { loadMonitorPermissions } from './brainMonitorPermissions.js';
import { createValidatedMonitor, transitionMonitorState } from './brainMonitors.js';
import { applyBeliefTransition } from './brainBeliefs.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WATCH_FIELDS = 'id, project_id, state, last_checked_at, last_triggered_at, next_check_at, expires_at, check_count, max_checks, created_at';

// A product projection, never raw belief provenance or monitor conditions.
export async function readCompanionContext({ userId, client = getSupabaseAdmin(), now = new Date() }) {
  const instant = new Date(now).toISOString();
  const [permissions, beliefs, monitors, projects] = await Promise.all([
    loadMonitorPermissions({ client, userId }),
    client.from('brain_beliefs').select('subject_type, subject_key, predicate, value, confidence, effective_until')
      .eq('user_id', userId).eq('record_status', 'current').in('subject_type', ['routine', 'preference'])
      .lte('effective_from', instant).order('effective_from', { ascending: false }).limit(40),
    client.from('brain_monitors').select(WATCH_FIELDS).eq('user_id', userId).eq('monitor_type', 'project_staleness')
      .in('state', ['active', 'suspended']).order('created_at', { ascending: false }).limit(20),
    client.from('projects').select('id, name').eq('user_id', userId).limit(200),
  ]);
  for (const result of [beliefs, monitors, projects]) if (result.error) throw result.error;
  const routineNames = { 'health.habit.shower': 'Shower', 'health.habit.creatine': 'Creatine', 'health.habit.skin': 'Skincare' };
  const preferenceNames = { 'communication.style': 'Communication', 'accountability.style': 'Accountability', 'voice.preference': 'Voice', 'communication.avoid_terms': 'Words to avoid' };
  const assumptions = (beliefs.data || []).filter((row) => !row.effective_until || new Date(row.effective_until) > new Date(now)).flatMap((row) => {
    if (row.subject_type === 'routine' && row.predicate === 'status' && routineNames[row.subject_key]
      && ['active', 'inactive', 'suspended', 'uncertain'].includes(row.value?.state)) {
      return [{ label: routineNames[row.subject_key], text: row.value.state, kind: 'routine', uncertain: Number(row.confidence) < 0.8 || row.value.state === 'uncertain' }];
    }
    const preference = row.value?.value;
    if (row.subject_type === 'preference' && row.predicate === 'value' && preferenceNames[row.subject_key]
      && (typeof preference === 'string' || (Array.isArray(preference) && preference.every((item) => typeof item === 'string')))) {
      return [{ label: preferenceNames[row.subject_key], text: (Array.isArray(preference) ? preference.join(', ') : preference).slice(0, 400), kind: 'preference', uncertain: Number(row.confidence) < 0.8 }];
    }
    return [];
  });
  const names = new Map((projects.data || []).map((project) => [project.id, project.name]));
  const watches = (monitors.data || []).filter((row) => names.has(row.project_id)).map((row) => ({
    project_name: String(names.get(row.project_id)).slice(0, 160),
    state: new Date(row.expires_at) <= new Date(now) || row.check_count >= row.max_checks ? 'expired' : row.state,
    last_checked_at: row.last_checked_at, last_triggered_at: row.last_triggered_at,
  }));
  return { permissions, assumptions, watches };
}

function requireUuid(value) {
  if (!UUID.test(String(value || ''))) throw new HttpError(400, 'Invalid identifier.');
  return value;
}

async function ownedProject(client, userId, projectId) {
  requireUuid(projectId);
  const result = await client.from('projects').select('id, status').eq('user_id', userId).eq('id', projectId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new HttpError(404, 'Project not found.');
  return result.data;
}

export async function readProjectWatch({ userId, projectId, client = getSupabaseAdmin(), now = new Date() }) {
  const project = await ownedProject(client, userId, projectId);
  projectId = project.id;
  const permissions = await loadMonitorPermissions({ client, userId });
  const monitors = await client.from('brain_monitors').select(WATCH_FIELDS).eq('user_id', userId)
    .eq('project_id', projectId).eq('monitor_type', 'project_staleness').order('created_at', { ascending: false }).limit(10);
  if (monitors.error) throw monitors.error;
  const row = (monitors.data || []).find((item) => ['active', 'suspended'].includes(item.state)) || monitors.data?.[0];
  const beliefs = await client.from('brain_beliefs').select('predicate, value, effective_until')
    .eq('user_id', userId).eq('subject_type', 'project_context').eq('subject_key', `project.${projectId}`)
    .eq('record_status', 'current').lte('effective_from', new Date(now).toISOString()).limit(12);
  if (beliefs.error) throw beliefs.error;
  const context = (beliefs.data || []).filter((belief) => (!belief.effective_until || new Date(belief.effective_until) > now)
    && ['priority_state', 'next_action', 'current_focus', 'context_summary'].includes(belief.predicate)
    && typeof belief.value?.value === 'string')
    .map((belief) => ({ field: belief.predicate, text: belief.value.value.slice(0, 400) }));
  const exhausted = row && (new Date(row.expires_at) <= now || row.check_count >= row.max_checks);
  return {
    permissions, context,
    watch: row ? { id: row.id, state: exhausted && ['active', 'suspended'].includes(row.state) ? 'expired' : row.state,
      last_checked_at: row.last_checked_at, last_triggered_at: row.last_triggered_at,
      next_check_at: row.next_check_at, expires_at: row.expires_at } : null,
  };
}

// Only typed app operations. Caller must authenticate the configured Supabase user.
export async function mutateCompanionApp({ userId, body, client = getSupabaseAdmin(), now = new Date() }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid request.');
  const allowed = body.action === 'project_watch'
    ? ['action', 'project_id', 'operation', 'watch_id'] : ['action', 'permission', 'enabled', 'request_id'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new HttpError(400, 'Unsupported request field.');
  if (body.action === 'companion_permission') {
    if (!['monitor', 'message'].includes(body.permission) || typeof body.enabled !== 'boolean') {
      throw new HttpError(400, 'Choose a supported permission and boolean value.');
    }
    requireUuid(body.request_id);
    await applyBeliefTransition({ userId, client, subjectType: 'companion_permission',
      subjectKey: `companion.${body.permission}`, predicate: 'grant', value: { enabled: body.enabled },
      sourceType: 'user_explicit', confidence: 1, effectiveFrom: now,
      provenance: { source: 'app_permission_control' },
      idempotencyKey: `app-permission:${body.request_id}:${body.permission}:${body.enabled}` });
    return { permissions: await loadMonitorPermissions({ client, userId }) };
  }
  if (body.action !== 'project_watch' || !['enable', 'suspend', 'retire'].includes(body.operation)) {
    throw new HttpError(400, 'Unsupported Companion operation.');
  }
  const project = await ownedProject(client, userId, body.project_id);
  const snapshot = await readProjectWatch({ client, userId, projectId: project.id, now });
  if (body.operation === 'enable') {
    if (!snapshot.permissions.monitor) throw new HttpError(403, 'Allow project monitoring before enabling Watch.');
    if (project.status !== 'active') throw new HttpError(409, 'Only active projects can be watched.');
    if (snapshot.watch && ['retired', 'expired'].includes(snapshot.watch.state)) {
      throw new HttpError(409, 'This Watch has ended. It cannot be resumed.');
    }
    if (!snapshot.watch) {
      const result = await createValidatedMonitor({ client, userId, now, sourceChannel: 'app', explicitUser: false,
        proposal: { monitor_type: 'project_staleness', project_id: project.id,
          reason: 'User requested a check for lost momentum on this active project.', confidence: 1 } });
      if (!['created', 'existing'].includes(result.status)) throw new HttpError(409, 'Watch could not be enabled. Refresh and try again.');
    } else {
      if (body.watch_id !== snapshot.watch.id) throw new HttpError(409, 'Watch changed. Refresh and try again.');
      await transitionMonitorState({ client, userId, now, monitorId: snapshot.watch.id, state: 'active' });
    }
  } else {
    if (!snapshot.watch || body.watch_id !== snapshot.watch.id) throw new HttpError(409, 'Watch changed. Refresh and try again.');
    await transitionMonitorState({ client, userId, now, monitorId: snapshot.watch.id,
      state: body.operation === 'suspend' ? 'suspended' : 'retired' });
  }
  return readProjectWatch({ client, userId, projectId: project.id, now });
}
