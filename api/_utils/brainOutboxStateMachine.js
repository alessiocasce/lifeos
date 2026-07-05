export const OUTBOX_STATUSES = ['queued', 'claimed', 'sent', 'failed', 'cancelled', 'expired'];
export const OUTBOX_ACK_STATUSES = ['sent', 'failed'];
export const MAX_OUTBOX_ATTEMPTS = 3;
export const DEFAULT_CLAIM_RECLAIM_TIMEOUT_MINUTES = 10;

// Allowed lifecycle: queued -> claimed -> sent | queued retry | failed | expired.
// sent -> sent is idempotent. Unsafe transitions such as queued -> sent are rejected.
export function normalizeOutboxStatus(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return OUTBOX_STATUSES.includes(text) ? text : null;
}

export function normalizeAckStatus(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return OUTBOX_ACK_STATUSES.includes(text) ? text : null;
}

export function canAckOutboxMessage({ row, ackStatus } = {}) {
  const status = normalizeOutboxStatus(row?.status);
  const ack = normalizeAckStatus(ackStatus);
  if (!row?.id) return { allowed: false, reason: 'missing_row', idempotent: false, transition: null };
  if (!ack) return { allowed: false, reason: 'invalid_ack_status', idempotent: false, transition: null };
  if (ack === 'sent' && status === 'sent') {
    return { allowed: true, reason: 'already_sent', idempotent: true, transition: 'sent->sent' };
  }
  if (status !== 'claimed') {
    return { allowed: false, reason: `cannot_ack_${ack}_from_${status || 'unknown'}`, idempotent: false, transition: null };
  }
  return { allowed: true, reason: null, idempotent: false, transition: `claimed->${ack}` };
}

export function nextOutboxStatusForAck({ currentAttempts = 0, ackStatus, expired = false } = {}) {
  const ack = normalizeAckStatus(ackStatus);
  if (!ack) return { status: null, retry: false };
  if (ack === 'sent') return { status: 'sent', retry: false };
  if (expired) return { status: 'expired', retry: false };
  if (Number(currentAttempts ?? 0) < MAX_OUTBOX_ATTEMPTS) return { status: 'queued', retry: true };
  return { status: 'failed', retry: false };
}

export function computeRetryBackoff(currentAttempts = 0) {
  const attempts = Math.max(0, Math.trunc(Number(currentAttempts)) || 0);
  if (attempts <= 1) return 2;
  if (attempts === 2) return 5;
  return 0;
}

export function isOutboxExpired(rowOrDate, now = new Date()) {
  const expiresAt = typeof rowOrDate === 'object' ? rowOrDate?.expires_at : rowOrDate;
  if (!expiresAt) return false;
  return normalizeDate(expiresAt) <= normalizeDate(now);
}

export function computeClaimRecovery(row, now = new Date()) {
  const nowDate = normalizeDate(now);
  if (!row || normalizeOutboxStatus(row.status) !== 'claimed' || row.sent_at) {
    return { action: 'keep', reason: 'not_reclaimable' };
  }
  if (isOutboxExpired(row, nowDate)) return { action: 'expire', reason: 'expired' };
  if (Number(row.attempts ?? 0) >= MAX_OUTBOX_ATTEMPTS) return { action: 'fail', reason: 'max_attempts' };
  return { action: 'requeue', reason: 'stale_claim', scheduled_for: nowDate.toISOString() };
}

export function buildAckMetadataPatch({
  existingMetadata = {},
  metadata = {},
  now = new Date(),
  transition,
  retry = false,
  retryAfter = null,
  retryDelayMinutes = null,
} = {}) {
  const nowIso = normalizeDate(now).toISOString();
  return {
    ...safeObject(existingMetadata),
    ...safeObject(metadata),
    outbox_ack_transition: transition ?? null,
    ...(transition === 'claimed->sent' ? { acked_at: nowIso } : {}),
    ...(transition?.startsWith('claimed->') && transition !== 'claimed->sent' ? {
      last_failed_at: nowIso,
      retry,
      retry_after: retryAfter,
      retry_delay_minutes: retryDelayMinutes || null,
    } : {}),
  };
}

export function buildClaimMetadataPatch({ existingMetadata = {}, bridgeId = null, now = new Date() } = {}) {
  const nowIso = normalizeDate(now).toISOString();
  return {
    ...safeObject(existingMetadata),
    bridge_id: bridgeId || null,
    claimed_at: nowIso,
    outbox_claim_transition: 'queued->claimed',
  };
}

export function buildReclaimMetadataPatch({ existingMetadata = {}, row = {}, decision, now = new Date() } = {}) {
  const nowIso = normalizeDate(now).toISOString();
  return {
    ...safeObject(existingMetadata),
    reclaimed_at: nowIso,
    reclaimed_reason: decision?.reason ?? null,
    prior_claimed_at: row.claimed_at ?? null,
    outbox_reclaim_transition: decision?.action ? `claimed->${decision.action}` : null,
  };
}

export function getClaimReclaimTimeoutMinutes(value = process.env.LIFEOS_OUTBOX_CLAIM_TIMEOUT_MINUTES) {
  const numeric = Number(value ?? DEFAULT_CLAIM_RECLAIM_TIMEOUT_MINUTES);
  if (!Number.isFinite(numeric)) return DEFAULT_CLAIM_RECLAIM_TIMEOUT_MINUTES;
  return Math.min(60, Math.max(1, Math.trunc(numeric)));
}

function normalizeDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
