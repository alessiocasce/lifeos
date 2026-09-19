import { generateGeminiJson } from './gemini.js';
import {
  applyRoutineStateTransition,
  buildRoutineBeliefIdentity,
} from './brainBeliefs.js';
import { normalizeHabitId } from './habits.js';

export const ROUTINE_SEMANTIC_OPERATIONS = Object.freeze([
  'no_change',
  'deactivate',
  'suspend',
  'reactivate',
  'stale_assumption',
]);

const DEFAULT_SUSPENSION_DAYS = 14;
const MAX_SUSPENSION_DAYS = 365;
const ROUTINE_SEMANTICS_SYSTEM = `
You extract a narrow LifeOS routine-state operation from ordinary conversation.
Return JSON only. Do not answer the user and do not propose any other action.

Schema:
{
  "operation": "no_change" | "deactivate" | "suspend" | "reactivate" | "stale_assumption",
  "routine_id": "shower" | "creatine" | "skin" | null,
  "confidence": 0.0,
  "reason": "short semantic explanation",
  "evidence": "short grounded phrase from the user or null",
  "effective_from": "ISO timestamp or null",
  "effective_until": "ISO timestamp or null",
  "duration_days": null
}

Meaning:
- deactivate: the user explicitly says the routine/tracking is no longer active or wanted.
- suspend: the user explicitly wants a temporary pause.
- reactivate: the user explicitly says the routine/tracking started again.
- stale_assumption: the user says LifeOS may have an outdated assumption but does not clearly state the new durable state.
- no_change: an immediate check-in answer, bare no/not-yet, completion, unrelated content, or insufficient evidence.

Rules:
- A bare "no", "not yet", "non ancora", or "skip" is no_change. It never means permanent deactivation.
- Resolve pronouns such as "that" or "it" only when targetRoutineId is provided.
- Never switch to a different routine unless the user explicitly names it.
- Do not infer calendar, memo, health-log, memory, or destructive actions.
- Prefer no_change when uncertain.
`;

export async function inferRoutineStateChange({
  message,
  targetRoutineId = null,
  currentBelief = null,
  now = new Date(),
  infer = inferRoutineStateChangeWithModel,
} = {}) {
  const text = cleanText(message, 2000);
  if (!text) return noChange('empty_message');
  const explicitRoutineId = inferRoutineIdFromMessage(text);
  const normalizedTarget = normalizeHabitId(targetRoutineId);
  if (isBareRoutineReply(text)) return noChange('bare_reply');
  if (!normalizedTarget && !explicitRoutineId) return noChange('no_grounded_routine');

  const raw = await infer({
    message: text,
    targetRoutineId: normalizedTarget || null,
    explicitRoutineId: explicitRoutineId || null,
    currentState: currentBelief?.value?.state || null,
    now: normalizeDate(now).toISOString(),
  });
  return validateRoutineSemanticInference(raw, {
    message: text,
    targetRoutineId: normalizedTarget,
    explicitRoutineId,
    now,
  });
}

export async function inferRoutineStateChangeWithModel(input) {
  return generateGeminiJson({
    system: ROUTINE_SEMANTICS_SYSTEM,
    prompt: JSON.stringify(input),
    temperature: 0,
    repair: true,
    invalidMessage: 'Gemini returned an invalid routine-state operation.',
  });
}

export function validateRoutineSemanticInference(raw, {
  message = '',
  targetRoutineId = null,
  explicitRoutineId = inferRoutineIdFromMessage(message),
  now = new Date(),
} = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return noChange('invalid_inference');
  const operation = ROUTINE_SEMANTIC_OPERATIONS.includes(raw.operation) ? raw.operation : 'no_change';
  if (operation === 'no_change') return noChange('model_no_change', raw);
  if (isBareRoutineReply(message)) return noChange('bare_reply_guard', raw);

  const normalizedTarget = normalizeHabitId(targetRoutineId);
  const inferredRoutineId = normalizeHabitId(raw.routine_id);
  const groundedRoutineId = normalizeHabitId(explicitRoutineId);
  let routineId = inferredRoutineId || groundedRoutineId || normalizedTarget;
  if (!routineId) return noChange('missing_routine', raw);
  if (inferredRoutineId && normalizedTarget && inferredRoutineId !== normalizedTarget && groundedRoutineId !== inferredRoutineId) {
    return noChange('cross_target_not_grounded', raw);
  }
  if (groundedRoutineId && inferredRoutineId && groundedRoutineId !== inferredRoutineId) {
    return noChange('routine_mismatch', raw);
  }
  routineId = groundedRoutineId || inferredRoutineId || normalizedTarget;

  const minimum = operation === 'stale_assumption' ? 0.6 : (operation === 'suspend' ? 0.7 : 0.75);
  const confidence = clampConfidence(raw.confidence);
  if (confidence < minimum) return noChange('low_confidence', raw);

  const nowDate = normalizeDate(now);
  let effectiveUntil = normalizePlausibleIso(raw.effective_until, nowDate, { futureOnly: true });
  let inferredDefaultDuration = false;
  if (operation === 'suspend' && !effectiveUntil) {
    const durationDays = normalizeDurationDays(raw.duration_days);
    const days = durationDays || DEFAULT_SUSPENSION_DAYS;
    effectiveUntil = new Date(nowDate.getTime() + days * 24 * 60 * 60000).toISOString();
    inferredDefaultDuration = !durationDays;
  }
  const effectiveFrom = normalizePlausibleIso(raw.effective_from, nowDate, { futureOnly: false }) || nowDate.toISOString();
  const state = operationToState(operation);
  return {
    operation,
    routine_id: routineId,
    state,
    confidence,
    reason: cleanText(raw.reason, 240) || operation,
    evidence: cleanText(raw.evidence, 240),
    effective_from: effectiveFrom,
    effective_until: effectiveUntil,
    inferred_default_duration: inferredDefaultDuration,
    persist: true,
    validation_reason: 'validated',
  };
}

export async function applyRoutineSemanticOperation({
  semantic,
  userId,
  idempotencyKey,
  sourceRef = {},
  provenance = {},
  client,
} = {}) {
  if (!semantic?.persist || semantic.operation === 'no_change') return null;
  const identity = buildRoutineBeliefIdentity(semantic.routine_id);
  return applyRoutineStateTransition({
    routineId: identity.routine_id,
    state: semantic.state,
    confidence: semantic.confidence,
    sourceType: 'user_explicit',
    sourceRef,
    provenance: {
      ...safeObject(provenance),
      semantic_operation: semantic.operation,
      semantic_reason: semantic.reason,
      evidence: semantic.evidence,
      inferred_default_duration: semantic.inferred_default_duration,
      validator: 'brain_routine_semantics_v1',
    },
    effectiveFrom: semantic.effective_from,
    effectiveUntil: semantic.effective_until,
    metadata: {
      semantic_operation: semantic.operation,
      needs_clarification: semantic.operation === 'stale_assumption',
      proactive_suppressed_until: semantic.operation === 'stale_assumption'
        ? new Date(new Date(semantic.effective_from).getTime() + 7 * 24 * 60 * 60000).toISOString()
        : undefined,
    },
    idempotencyKey,
    userId,
    client,
  });
}

export function inferRoutineIdFromMessage(message) {
  const text = normalizeText(message);
  if (/(?:\bskincare\b|\bskin care\b|\bpelle\b)/.test(text)) return 'skin';
  if (/(?:\bcreatin[ae]\b)/.test(text)) return 'creatine';
  if (/(?:\bdoccia\b|\bshower\b)/.test(text)) return 'shower';
  return '';
}

export function isBareRoutineReply(message) {
  const text = normalizeText(message);
  return /^(?:no|nope|nah|non ancora|not yet|skip|salta|si|yes|ok|okay|fatto|fatta|done|presa|preso)$/.test(text);
}

export function serializeRoutineSemanticResult(result) {
  if (!result) return null;
  return {
    operation: result.operation,
    routine_id: result.routine_id || null,
    state: result.state || null,
    confidence: Number(result.confidence) || 0,
    persist: Boolean(result.persist),
    validation_reason: result.validation_reason || null,
    effective_from: result.effective_from || null,
    effective_until: result.effective_until || null,
    inferred_default_duration: Boolean(result.inferred_default_duration),
  };
}

function operationToState(operation) {
  if (operation === 'deactivate') return 'inactive';
  if (operation === 'suspend') return 'suspended';
  if (operation === 'reactivate') return 'active';
  return 'uncertain';
}

function noChange(reason, raw = null) {
  return {
    operation: 'no_change',
    routine_id: null,
    state: null,
    confidence: 0,
    persist: false,
    validation_reason: reason,
    proposed_operation: raw?.operation || null,
  };
}

function normalizeDurationDays(value) {
  const days = Math.trunc(Number(value));
  return Number.isFinite(days) && days >= 1 && days <= MAX_SUSPENSION_DAYS ? days : null;
}

function normalizePlausibleIso(value, now, { futureOnly }) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (futureOnly && date <= now) return null;
  const deltaDays = Math.abs(date.getTime() - now.getTime()) / (24 * 60 * 60000);
  if (deltaDays > 730) return null;
  return date.toISOString();
}

function clampConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid semantic inference time.');
  return date;
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text && text.length <= maxLength ? text : null;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
