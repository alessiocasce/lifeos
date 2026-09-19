import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import { normalizeHabitId } from './habits.js';

export const ROUTINE_BELIEF_SUBJECT_TYPE = 'routine';
export const ROUTINE_BELIEF_PREDICATE = 'status';
export const ROUTINE_STATES = Object.freeze(['active', 'inactive', 'suspended', 'uncertain']);
export const BELIEF_SOURCE_TYPES = Object.freeze([
  'user_explicit',
  'assistant_inferred',
  'proactive_feedback',
  'system',
  'manual',
]);

const BELIEF_SELECT = [
  'id',
  'user_id',
  'subject_type',
  'subject_key',
  'predicate',
  'value',
  'record_status',
  'confidence',
  'source_type',
  'source_ref',
  'provenance',
  'effective_from',
  'effective_until',
  'supersedes_id',
  'negative_feedback_count',
  'last_feedback_at',
  'idempotency_key',
  'created_at',
  'updated_at',
].join(', ');

const FIRST_NEGATIVE_SUPPRESSION_HOURS = 8;
const REPEATED_NEGATIVE_SUPPRESSION_DAYS = 7;

export function buildRoutineBeliefIdentity(routineId) {
  const normalized = normalizeHabitId(routineId) || cleanIdentifier(routineId, 100);
  if (!normalized) throw new Error('A valid routine id is required.');
  return {
    subject_type: ROUTINE_BELIEF_SUBJECT_TYPE,
    subject_key: `health.habit.${normalized}`,
    predicate: ROUTINE_BELIEF_PREDICATE,
    routine_id: normalized,
  };
}

export function normalizeRoutineStateTransition({ routineId, state, confidence, effectiveUntil = null, metadata = {} } = {}) {
  const identity = buildRoutineBeliefIdentity(routineId);
  const normalizedState = cleanIdentifier(state, 40);
  if (!ROUTINE_STATES.includes(normalizedState)) throw new Error(`Unsupported routine state: ${state || '(missing)'}`);
  const until = normalizeOptionalIso(effectiveUntil, 'effectiveUntil');
  if (normalizedState === 'suspended' && !until) throw new Error('Suspended routines require effectiveUntil.');
  return {
    ...identity,
    value: {
      state: normalizedState,
      routine_id: identity.routine_id,
      ...safeObject(metadata),
    },
    confidence: clampConfidence(confidence, normalizedState === 'uncertain' ? 0.45 : 0.9),
    effective_until: until,
  };
}

export async function getCurrentBelief({
  userId = getActionUserId(),
  subjectType,
  subjectKey,
  predicate,
  client = getSupabaseAdmin(),
} = {}) {
  const identity = normalizeBeliefIdentity({ subjectType, subjectKey, predicate });
  const result = await client
    .from('brain_beliefs')
    .select(BELIEF_SELECT)
    .eq('user_id', userId)
    .eq('subject_type', identity.subject_type)
    .eq('subject_key', identity.subject_key)
    .eq('predicate', identity.predicate)
    .eq('record_status', 'current')
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function getCurrentRoutineBelief({ routineId, userId = getActionUserId(), client = getSupabaseAdmin() } = {}) {
  const identity = buildRoutineBeliefIdentity(routineId);
  return getCurrentBelief({
    userId,
    subjectType: identity.subject_type,
    subjectKey: identity.subject_key,
    predicate: identity.predicate,
    client,
  });
}

export async function listCurrentBeliefs({
  userId = getActionUserId(),
  subjectType = null,
  client = getSupabaseAdmin(),
  limit = 100,
} = {}) {
  let query = client
    .from('brain_beliefs')
    .select(BELIEF_SELECT)
    .eq('user_id', userId)
    .eq('record_status', 'current')
    .order('effective_from', { ascending: false })
    .limit(Math.min(200, Math.max(1, Number(limit) || 100)));
  if (subjectType) query = query.eq('subject_type', cleanIdentifier(subjectType, 80));
  const result = await query;
  if (result.error) throw result.error;
  return result.data || [];
}

export async function listBeliefHistory({
  userId = getActionUserId(),
  subjectType,
  subjectKey,
  predicate,
  client = getSupabaseAdmin(),
  limit = 50,
} = {}) {
  const identity = normalizeBeliefIdentity({ subjectType, subjectKey, predicate });
  const result = await client
    .from('brain_beliefs')
    .select(BELIEF_SELECT)
    .eq('user_id', userId)
    .eq('subject_type', identity.subject_type)
    .eq('subject_key', identity.subject_key)
    .eq('predicate', identity.predicate)
    .order('effective_from', { ascending: false })
    .limit(Math.min(100, Math.max(1, Number(limit) || 50)));
  if (result.error) throw result.error;
  return result.data || [];
}

export async function applyBeliefTransition({
  userId = getActionUserId(),
  subjectType,
  subjectKey,
  predicate,
  value,
  confidence = 0.8,
  sourceType = 'assistant_inferred',
  sourceRef = {},
  provenance = {},
  effectiveFrom = new Date(),
  effectiveUntil = null,
  negativeFeedbackCount = 0,
  lastFeedbackAt = null,
  idempotencyKey,
  client = getSupabaseAdmin(),
} = {}) {
  const identity = normalizeBeliefIdentity({ subjectType, subjectKey, predicate });
  const cleanSourceType = BELIEF_SOURCE_TYPES.includes(sourceType) ? sourceType : null;
  if (!cleanSourceType) throw new Error(`Unsupported belief source type: ${sourceType || '(missing)'}`);
  const cleanIdempotencyKey = cleanText(idempotencyKey, 240);
  if (!cleanIdempotencyKey) throw new Error('Belief transitions require an idempotency key.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Belief value must be an object.');

  const result = await client.rpc('apply_brain_belief_transition', {
    p_user_id: userId,
    p_subject_type: identity.subject_type,
    p_subject_key: identity.subject_key,
    p_predicate: identity.predicate,
    p_value: value,
    p_confidence: clampConfidence(confidence, 0.8),
    p_source_type: cleanSourceType,
    p_source_ref: safeObject(sourceRef),
    p_provenance: safeObject(provenance),
    p_effective_from: normalizeIso(effectiveFrom, 'effectiveFrom'),
    p_effective_until: normalizeOptionalIso(effectiveUntil, 'effectiveUntil'),
    p_negative_feedback_count: Math.max(0, Math.trunc(Number(negativeFeedbackCount) || 0)),
    p_last_feedback_at: normalizeOptionalIso(lastFeedbackAt, 'lastFeedbackAt'),
    p_idempotency_key: cleanIdempotencyKey,
  });
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data[0] : result.data;
}

export async function applyRoutineStateTransition({
  routineId,
  state,
  confidence,
  sourceType = 'user_explicit',
  sourceRef = {},
  provenance = {},
  effectiveFrom = new Date(),
  effectiveUntil = null,
  metadata = {},
  idempotencyKey,
  userId = getActionUserId(),
  client = getSupabaseAdmin(),
} = {}) {
  const transition = normalizeRoutineStateTransition({ routineId, state, confidence, effectiveUntil, metadata });
  return applyBeliefTransition({
    userId,
    subjectType: transition.subject_type,
    subjectKey: transition.subject_key,
    predicate: transition.predicate,
    value: transition.value,
    confidence: transition.confidence,
    sourceType,
    sourceRef,
    provenance,
    effectiveFrom,
    effectiveUntil: transition.effective_until,
    negativeFeedbackCount: state === 'active' ? 0 : Number(metadata.negative_feedback_count) || 0,
    lastFeedbackAt: metadata.last_feedback_at || null,
    idempotencyKey,
    client,
  });
}

export function computeRoutineNegativeFeedbackTransition({ currentBelief = null, now = new Date() } = {}) {
  const nowDate = normalizeDate(now, 'now');
  const previousCount = Math.max(0, Number(currentBelief?.negative_feedback_count) || 0);
  const nextCount = previousCount + 1;
  const repeated = nextCount >= 2;
  const previousState = ROUTINE_STATES.includes(currentBelief?.value?.state)
    ? currentBelief.value.state
    : 'active';
  const state = ['inactive', 'suspended'].includes(previousState)
    ? previousState
    : (repeated ? 'uncertain' : 'active');
  const suppressionMs = repeated
    ? REPEATED_NEGATIVE_SUPPRESSION_DAYS * 24 * 60 * 60000
    : FIRST_NEGATIVE_SUPPRESSION_HOURS * 60 * 60000;
  const suppressedUntil = new Date(nowDate.getTime() + suppressionMs).toISOString();
  return {
    state,
    confidence: repeated ? 0.35 : Math.min(0.65, Number(currentBelief?.confidence) || 0.65),
    negative_feedback_count: nextCount,
    last_feedback_at: nowDate.toISOString(),
    value: {
      ...safeObject(currentBelief?.value),
      state,
      negative_feedback_count: nextCount,
      last_feedback: 'no',
      proactive_suppressed_until: suppressedUntil,
      needs_clarification: repeated,
    },
  };
}

export async function recordRoutineNegativeFeedback({
  routineId,
  sourceRef = {},
  provenance = {},
  idempotencyKey,
  now = new Date(),
  userId = getActionUserId(),
  client = getSupabaseAdmin(),
} = {}) {
  const identity = buildRoutineBeliefIdentity(routineId);
  const currentBelief = await getCurrentRoutineBelief({ routineId, userId, client });
  const transition = computeRoutineNegativeFeedbackTransition({ currentBelief, now });
  transition.value.routine_id = identity.routine_id;
  return applyBeliefTransition({
    userId,
    subjectType: identity.subject_type,
    subjectKey: identity.subject_key,
    predicate: identity.predicate,
    value: transition.value,
    confidence: transition.confidence,
    sourceType: 'proactive_feedback',
    sourceRef,
    provenance: {
      ...safeObject(provenance),
      evidence_kind: 'negative_proactive_reply',
      permanent_state_inferred: false,
    },
    effectiveFrom: now,
    negativeFeedbackCount: transition.negative_feedback_count,
    lastFeedbackAt: transition.last_feedback_at,
    idempotencyKey,
    client,
  });
}

export function evaluateRoutineProactivePolicy(belief, { now = new Date() } = {}) {
  if (!belief) return { allowed: true, mode: 'normal', reason: 'no_explicit_belief' };
  const nowDate = normalizeDate(now, 'now');
  const state = belief.value?.state;
  if (state === 'inactive') return { allowed: false, mode: 'suppressed', reason: 'routine_inactive' };
  const effectiveUntil = optionalDate(belief.effective_until);
  if (state === 'suspended' && (!effectiveUntil || effectiveUntil > nowDate)) {
    return { allowed: false, mode: 'suppressed', reason: 'routine_suspended' };
  }
  const suppressedUntil = optionalDate(belief.value?.proactive_suppressed_until);
  if (suppressedUntil && suppressedUntil > nowDate) {
    return { allowed: false, mode: 'suppressed', reason: 'negative_feedback_cooldown', until: suppressedUntil.toISOString() };
  }
  if (state === 'uncertain' || belief.value?.needs_clarification) {
    return { allowed: true, mode: 'clarify', reason: 'routine_state_uncertain' };
  }
  return { allowed: true, mode: 'normal', reason: state === 'active' ? 'routine_active' : 'unrecognized_state' };
}

export function serializeBeliefForContext(belief) {
  if (!belief) return null;
  return {
    id: belief.id,
    subject_type: belief.subject_type,
    subject_key: belief.subject_key,
    predicate: belief.predicate,
    value: safeObject(belief.value),
    confidence: Number(belief.confidence),
    source_type: belief.source_type,
    effective_from: belief.effective_from,
    effective_until: belief.effective_until,
    negative_feedback_count: Number(belief.negative_feedback_count) || 0,
    last_feedback_at: belief.last_feedback_at,
    provenance: safeObject(belief.provenance),
  };
}

function normalizeBeliefIdentity({ subjectType, subjectKey, predicate } = {}) {
  const identity = {
    subject_type: cleanIdentifier(subjectType, 80),
    subject_key: cleanSubjectKey(subjectKey),
    predicate: cleanIdentifier(predicate, 120),
  };
  if (!identity.subject_type || !identity.subject_key || !identity.predicate) {
    throw new Error('Belief subject type, subject key, and predicate are required.');
  }
  return identity;
}

function cleanSubjectKey(value) {
  const text = cleanText(value, 180);
  return text && /^[a-z0-9][a-z0-9._:-]*$/i.test(text) ? text.toLowerCase() : null;
}

function cleanIdentifier(value, maxLength) {
  const text = cleanText(value, maxLength);
  return text && /^[a-z][a-z0-9_-]*$/i.test(text) ? text.toLowerCase() : null;
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function clampConfidence(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function normalizeDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${label}.`);
  return date;
}

function normalizeIso(value, label) {
  return normalizeDate(value, label).toISOString();
}

function normalizeOptionalIso(value, label) {
  return value == null || value === '' ? null : normalizeIso(value, label);
}

function optionalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
