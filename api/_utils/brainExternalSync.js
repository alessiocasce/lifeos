import crypto from 'node:crypto';
import { applyBeliefTransition, buildRoutineBeliefIdentity, normalizeRoutineStateTransition } from './brainBeliefs.js';
import { normalizeHabitId } from './habits.js';
import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';

const MAX_UPDATES = 8;
const CLAIM_MINUTES = 2;
const PREF_STRING_KEYS = new Set(['communication.style', 'accountability.style', 'voice.preference']);
const PREF_ARRAY_KEYS = new Set(['communication.avoid_terms']);
const PROJECT_TEXT_FIELDS = new Set(['current_focus', 'next_action', 'context_summary']);
const PROJECT_PRIORITY_STATES = new Set(['active_priority', 'temporarily_deprioritized', 'on_hold']);
const SECRET_PATTERN = /\b(?:api[_ -]?key|bearer|password|passphrase|private[_ -]?key|secret|access[_ -]?token|refresh[_ -]?token|service[_ -]?role|credential)\b/i;

export class ExternalSyncError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function normalizeExternalSyncRequest(input, { now = new Date() } = {}) {
  objectOnly(input, 'Sync request');
  allowKeys(input, ['idempotency_key', 'source', 'summary', 'updates'], 'Sync request');
  const idempotencyKey = requiredText(input.idempotency_key, 160, 'idempotency_key', /^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
  objectOnly(input.source, 'source');
  allowKeys(input.source, ['system', 'kind', 'captured_at', 'reference'], 'source');
  const system = requiredText(input.source.system, 64, 'source.system', /^[a-z][a-z0-9_-]*$/);
  const kind = requiredText(input.source.kind, 64, 'source.kind', /^[a-z][a-z0-9_-]*$/);
  if (kind !== 'explicit_conversation_sync') throw invalid('Only explicit_conversation_sync is supported.');
  const capturedAt = requiredIso(input.source.captured_at, 'source.captured_at');
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs) || Date.parse(capturedAt) > nowMs + 5 * 60000 || Date.parse(capturedAt) < nowMs - 366 * 86400000) {
    throw invalid('source.captured_at is outside the supported time window.');
  }
  const reference = optionalText(input.source.reference, 160, 'source.reference');
  const summary = requiredText(input.summary, 240, 'summary');
  if (!Array.isArray(input.updates) || input.updates.length < 1 || input.updates.length > MAX_UPDATES) {
    throw invalid(`updates must contain 1-${MAX_UPDATES} items.`);
  }
  const updates = input.updates.map((update) => normalizeUpdate(update, capturedAt, nowMs));
  if (new Set(updates.map((update) => update.client_update_id)).size !== updates.length) {
    throw invalid('client_update_id must be unique within a request.');
  }
  return {
    idempotency_key: idempotencyKey,
    source: { system, kind, captured_at: capturedAt, reference },
    summary,
    updates,
  };
}

export async function groundExternalSyncUpdates(request, { userId, client = getSupabaseAdmin() } = {}) {
  const projects = request.updates.filter((update) => update.type === 'project_context');
  if (!projects.length) return request.updates;
  const list = await client.from('projects').select('id, name').eq('user_id', userId).limit(300);
  if (list.error) throw new ExternalSyncError('persistence_failed', 'Project grounding is temporarily unavailable.');
  const rows = list.data || [];
  return request.updates.map((update) => {
    if (update.type !== 'project_context') return update;
    const matches = update.project_id
      ? rows.filter((row) => row.id === update.project_id)
      : rows.filter((row) => normalizedProjectName(row.name) === normalizedProjectName(update.project_name));
    if (matches.length !== 1) throw invalid(matches.length ? 'Project name is ambiguous.' : 'Project was not found.');
    if (update.project_name && normalizedProjectName(matches[0].name) !== normalizedProjectName(update.project_name)) {
      throw invalid('Project id and name do not refer to the same project.');
    }
    return { ...update, project_id: matches[0].id, project_name: matches[0].name };
  });
}

export async function syncExternalContext({
  request,
  userId = getActionUserId(),
  client = getSupabaseAdmin(),
  now = new Date(),
} = {}) {
  const normalized = normalizeExternalSyncRequest(request, { now });
  const digest = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  const existing = await findRequest(client, userId, normalized.idempotency_key);
  if (existing && existing.request_digest !== digest) throw new ExternalSyncError('idempotency_conflict', 'Idempotency key was already used with different content.');
  if (existing?.status === 'applied') return publicResult(existing, true);

  // Entity grounding precedes audit reservation and every belief mutation.
  const updates = await groundExternalSyncUpdates(normalized, { userId, client });
  const claimToken = crypto.randomUUID();
  const leaseUntil = new Date(new Date(now).getTime() + CLAIM_MINUTES * 60000).toISOString();
  let audit = existing;
  if (!audit) {
    const inserted = await client.from('brain_external_sync_requests').insert({
      user_id: userId,
      idempotency_key: normalized.idempotency_key,
      request_digest: digest,
      source_system: normalized.source.system,
      source_kind: normalized.source.kind,
      source_reference: normalized.source.reference,
      captured_at: normalized.source.captured_at,
      summary: normalized.summary,
      requested_count: updates.length,
      status: 'processing',
      claim_token: claimToken,
      claim_expires_at: leaseUntil,
      results: [],
    }).select().single();
    if (inserted.error && inserted.error.code !== '23505') throw new ExternalSyncError('persistence_failed', 'Could not begin semantic sync.');
    audit = inserted.error ? await findRequest(client, userId, normalized.idempotency_key) : inserted.data;
    if (!audit) throw new ExternalSyncError('persistence_failed', 'Could not read semantic sync state.');
  }
  if (audit.request_digest !== digest) throw new ExternalSyncError('idempotency_conflict', 'Idempotency key was already used with different content.');
  if (audit.status === 'applied') return publicResult(audit, true);
  if (audit.claim_token !== claimToken) {
    if (audit.status === 'processing' && Date.parse(audit.claim_expires_at) > new Date(now).getTime()) {
      throw new ExternalSyncError('sync_in_progress', 'This sync request is already in progress. Retry shortly.');
    }
    const claimed = await client.from('brain_external_sync_requests').update({
      status: 'processing', claim_token: claimToken, claim_expires_at: leaseUntil,
    }).eq('user_id', userId).eq('id', audit.id).eq('claim_token', audit.claim_token).select().maybeSingle();
    if (claimed.error) throw new ExternalSyncError('persistence_failed', 'Could not resume semantic sync.');
    if (!claimed.data) throw new ExternalSyncError('sync_in_progress', 'This sync request is already in progress. Retry shortly.');
    audit = claimed.data;
  }

  const results = Array.isArray(audit.results) ? [...audit.results] : [];
  for (const update of updates) {
    if (results.some((item) => item.client_update_id === update.client_update_id && item.status === 'applied')) continue;
    try {
      const result = await applyUpdate(update, { request: normalized, userId, client, auditId: audit.id });
      const prior = results.findIndex((item) => item.client_update_id === update.client_update_id);
      if (prior >= 0) results[prior] = result;
      else results.push(result);
      audit = await saveAudit(client, userId, audit.id, claimToken, {
        results, applied_count: results.filter((item) => item.status === 'applied').length,
        rejected_count: results.filter((item) => item.status !== 'applied').length,
      });
    } catch {
      const failure = { client_update_id: update.client_update_id, type: update.type, status: 'failed', reason: 'persistence_failed' };
      const prior = results.findIndex((item) => item.client_update_id === update.client_update_id);
      if (prior >= 0) results[prior] = failure;
      else results.push(failure);
      audit = await saveAudit(client, userId, audit.id, claimToken, {
        status: 'partial', results,
        applied_count: results.filter((item) => item.status === 'applied').length,
        rejected_count: results.filter((item) => item.status !== 'applied').length,
        completed_at: new Date().toISOString(),
      });
      return publicResult(audit, false);
    }
  }
  audit = await saveAudit(client, userId, audit.id, claimToken, {
    status: 'applied', results, applied_count: results.length, rejected_count: 0,
    completed_at: new Date().toISOString(), claim_expires_at: null,
  });
  return publicResult(audit, false);
}

function normalizeUpdate(input, capturedAt, nowMs) {
  objectOnly(input, 'update');
  const type = requiredText(input.type, 40, 'type', /^[a-z][a-z0-9_]*$/);
  const clientId = requiredText(input.client_update_id, 64, 'client_update_id', /^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
  const confidence = Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0.8 || confidence > 1) throw invalid('confidence must be between 0.8 and 1.');
  const evidence = requiredText(input.evidence_summary, 280, 'evidence_summary');
  const common = { client_update_id: clientId, type, confidence, evidence_summary: evidence };
  const effectiveFrom = input.effective_from ? requiredIso(input.effective_from, 'effective_from') : capturedAt;
  if (Date.parse(effectiveFrom) > nowMs + 5 * 60000) throw invalid('Future effective_from is not supported.');
  if (type === 'routine_state') {
    allowKeys(input, ['client_update_id', 'type', 'routine_id', 'state', 'confidence', 'effective_from', 'effective_until', 'evidence_summary'], 'routine_state');
    const routineId = normalizeHabitId(input.routine_id);
    if (!routineId) throw invalid('Only tracked Health routines may be synchronized.');
    const state = input.state;
    if (!['active', 'inactive', 'suspended'].includes(state)) throw invalid('Unsupported routine state.');
    const until = input.effective_until ? requiredIso(input.effective_until, 'effective_until') : null;
    if (state === 'suspended' && (!until || Date.parse(until) <= nowMs || Date.parse(until) > nowMs + 366 * 86400000)) {
      throw invalid('Suspension requires a future effective_until within one year.');
    }
    if (state !== 'suspended' && until) throw invalid('Only suspended routines may have effective_until.');
    normalizeRoutineStateTransition({ routineId, state, confidence, effectiveUntil: until });
    return { ...common, routine_id: routineId, state, effective_from: effectiveFrom, effective_until: until };
  }
  if (type === 'preference') {
    allowKeys(input, ['client_update_id', 'type', 'key', 'value', 'confidence', 'effective_from', 'evidence_summary'], 'preference');
    const key = requiredText(input.key, 80, 'key', /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);
    if (!PREF_STRING_KEYS.has(key) && !PREF_ARRAY_KEYS.has(key)) throw invalid('Unsupported preference key.');
    let value;
    if (PREF_STRING_KEYS.has(key)) value = requiredText(input.value, 160, 'preference value');
    else {
      if (!Array.isArray(input.value) || input.value.length < 1 || input.value.length > 8) throw invalid('Preference terms must contain 1-8 entries.');
      value = input.value.map((entry) => requiredText(entry, 48, 'preference term'));
      if (new Set(value).size !== value.length) throw invalid('Preference terms must be unique.');
    }
    return { ...common, key, value, effective_from: effectiveFrom };
  }
  if (type === 'project_context') {
    allowKeys(input, ['client_update_id', 'type', 'project_id', 'project_name', 'field', 'value', 'confidence', 'effective_from', 'evidence_summary'], 'project_context');
    const projectId = input.project_id ? requiredText(input.project_id, 36, 'project_id', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) : null;
    const projectName = optionalText(input.project_name, 120, 'project_name');
    if (!projectId && !projectName) throw invalid('A project id or name is required.');
    const field = requiredText(input.field, 40, 'field', /^[a-z][a-z0-9_]*$/);
    if (!PROJECT_TEXT_FIELDS.has(field) && field !== 'priority_state') throw invalid('Unsupported project context field.');
    const value = requiredText(input.value, field === 'context_summary' ? 400 : 240, 'project context value');
    if (field === 'priority_state' && !PROJECT_PRIORITY_STATES.has(value)) throw invalid('Unsupported project priority state.');
    return { ...common, project_id: projectId, project_name: projectName, field, value, effective_from: effectiveFrom };
  }
  throw invalid('Unsupported semantic update type.');
}

async function applyUpdate(update, { request, userId, client, auditId }) {
  let subjectType;
  let subjectKey;
  let predicate;
  let value;
  if (update.type === 'routine_state') {
    const identity = buildRoutineBeliefIdentity(update.routine_id);
    subjectType = identity.subject_type;
    subjectKey = identity.subject_key;
    predicate = identity.predicate;
    value = { state: update.state, routine_id: update.routine_id };
  } else if (update.type === 'preference') {
    subjectType = 'preference';
    subjectKey = update.key;
    predicate = 'value';
    value = { value: update.value };
  } else {
    subjectType = 'project_context';
    subjectKey = `project.${update.project_id}`;
    predicate = update.field;
    value = { value: update.value, project_id: update.project_id, project_name: update.project_name };
  }
  const stableKey = crypto.createHash('sha256').update(`${userId}:${request.idempotency_key}:${update.client_update_id}:${update.type}`).digest('hex');
  const belief = await applyBeliefTransition({
    userId, client, subjectType, subjectKey, predicate, value,
    confidence: update.confidence, sourceType: 'external_sync',
    sourceRef: { external_sync_id: auditId, source_system: request.source.system, client_update_id: update.client_update_id },
    provenance: {
      source_kind: request.source.kind,
      source_reference: request.source.reference,
      captured_at: request.source.captured_at,
      evidence_summary: update.evidence_summary,
    },
    effectiveFrom: update.effective_from,
    effectiveUntil: update.effective_until || null,
    idempotencyKey: `external-sync:${stableKey}`,
  });
  return {
    client_update_id: update.client_update_id, type: update.type, status: 'applied',
    subject: subjectKey, predicate, current_value: belief.value,
  };
}

async function findRequest(client, userId, key) {
  const found = await client.from('brain_external_sync_requests').select('*').eq('user_id', userId).eq('idempotency_key', key).maybeSingle();
  if (found.error) throw new ExternalSyncError('persistence_failed', 'Could not read semantic sync state.');
  return found.data || null;
}

async function saveAudit(client, userId, id, claimToken, fields) {
  const saved = await client.from('brain_external_sync_requests').update(fields)
    .eq('user_id', userId).eq('id', id).eq('claim_token', claimToken).select().maybeSingle();
  if (saved.error || !saved.data) throw new ExternalSyncError('persistence_failed', 'Could not record semantic sync result.');
  return saved.data;
}

function publicResult(row, replay) {
  const results = Array.isArray(row.results) ? row.results : [];
  return {
    status: row.status,
    idempotent_replay: replay,
    summary: row.status === 'applied'
      ? `${row.applied_count} LifeOS context update${row.applied_count === 1 ? '' : 's'} applied.`
      : `${row.applied_count} of ${row.requested_count} LifeOS context updates applied. Retry with the same idempotency key.`,
    results: results.map((item) => ({ ...item })),
  };
}

function normalizedProjectName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

function objectOnly(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${label} must be an object.`);
}

function allowKeys(value, keys, label) {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw invalid(`${label} contains unsupported fields.`);
}

function requiredText(value, maxLength, label, pattern = null) {
  if (typeof value !== 'string') throw invalid(`${label} must be text.`);
  const text = value.trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text) || SECRET_PATTERN.test(text) || (pattern && !pattern.test(text))) {
    throw invalid(`${label} is invalid or exceeds its limit.`);
  }
  return text;
}

function optionalText(value, maxLength, label) {
  return value == null || value === '' ? null : requiredText(value, maxLength, label);
}

function requiredIso(value, label) {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw invalid(`${label} must be an ISO timestamp with a timezone.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw invalid(`${label} is invalid.`);
  return parsed.toISOString();
}

function invalid(message) {
  return new ExternalSyncError('invalid_request', message);
}
