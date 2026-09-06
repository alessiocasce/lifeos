import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import { TIME_ZONE } from './date.js';
import { accountabilityProactiveRuleFamily } from './brainProactiveAccountability.js';
import { sourceIsResolved } from './brainProactiveDelivery.js';
import { compareOutboxRowsForDelivery } from './brainOutboxStateMachine.js';

const MEMO_SELECT = 'id, user_id, title, memo_date, memo_time, notes, status, created_at, updated_at';
const DEFAULT_MAX_PER_DAY = 6;
const DEFAULT_MIN_GAP_MINUTES = 60;
const DEFAULT_QUIET_START = '23:00';
const DEFAULT_QUIET_END = '08:00';
const TIMED_MEMO_EXPIRY_HOURS = 6;
const OVERDUE_GRACE_MINUTES = 60;
const OVERDUE_EXPIRY_HOURS = 36;
const DATE_ONLY_CHECK_TIME = '09:00';

export const proactiveRuleRegistry = [
  {
    family: 'memo',
    loadContext: loadMemoProactiveContext,
    buildCandidates: buildMemoProactiveCandidatesFromContext,
  },
  accountabilityProactiveRuleFamily,
];

export async function evaluateProactiveCandidates({ userId = getActionUserId(), now = new Date(), recipient } = {}) {
  const nowDate = normalizeDate(now);
  const candidates = [];
  const skipped = [];
  const generated = [];

  for (const ruleFamily of proactiveRuleRegistry) {
    const ruleContext = await ruleFamily.loadContext({ userId, now: nowDate, recipient });
    const familyCandidates = ruleFamily.buildCandidates({ context: ruleContext, userId, now: nowDate, recipient });
    generated.push(...familyCandidates);
  }
  for (const candidate of generated.sort(compareOutboxRowsForDelivery)) {
    const validation = validateProactiveCandidate(candidate);
    if (!validation.ok) {
      skipped.push({ candidate, reason: validation.reason, family: candidate.source_type });
      continue;
    }
    const suppression = await shouldSuppressProactiveCandidate({ userId, candidate, now: nowDate, admitted: candidates });
    if (suppression.suppressed) {
      skipped.push({ candidate, reason: suppression.reason, family: candidate.source_type });
    } else {
      candidates.push(candidate);
    }
  }

  return { candidates, skipped };
}

export function validateProactiveCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return { ok: false, reason: 'invalid_candidate' };
  const required = ['channel', 'recipient', 'body', 'priority', 'rule_key', 'source_type', 'idempotency_key', 'scheduled_for'];
  for (const field of required) {
    if (!cleanText(candidate[field], field === 'body' ? 1500 : 240)) return { ok: false, reason: `missing_${field}` };
  }
  if (!cleanText(candidate.source_id, 240) && candidate.metadata?.source_required !== false) {
    return { ok: false, reason: 'missing_source_id' };
  }
  if (candidate.channel !== 'whatsapp') return { ok: false, reason: 'unsupported_channel' };
  if (!['low', 'normal', 'high'].includes(candidate.priority)) return { ok: false, reason: 'invalid_priority' };
  if (Number.isNaN(new Date(candidate.scheduled_for).getTime())) return { ok: false, reason: 'invalid_scheduled_for' };
  if (candidate.expires_at && Number.isNaN(new Date(candidate.expires_at).getTime())) return { ok: false, reason: 'invalid_expires_at' };
  if (!candidate.metadata || typeof candidate.metadata !== 'object' || Array.isArray(candidate.metadata)) {
    return { ok: false, reason: 'invalid_metadata' };
  }
  return { ok: true, reason: null };
}

export function buildMemoProactiveCandidates({ memo, now = new Date(), recipient } = {}) {
  const normalized = normalizeMemoForProactive(memo);
  const nowDate = normalizeDate(now);
  if (!normalized || normalized.status !== 'open' || !normalized.memo_date) return [];

  const language = detectLanguage(`${normalized.title} ${normalized.notes}`);
  const candidates = [];
  if (normalized.memo_time) {
    const dueAt = localDateTimeToUtcDate(normalized.memo_date, normalized.memo_time);
    if (nowDate >= dueAt && nowDate <= addHours(dueAt, TIMED_MEMO_EXPIRY_HOURS)) {
      candidates.push(buildMemoCandidate({
        memo: normalized,
        recipient,
        ruleKey: 'timed_memo_due',
        priority: 'high',
        scheduledFor: dueAt,
        expiresAt: addHours(dueAt, TIMED_MEMO_EXPIRY_HOURS),
        idempotencyKey: buildMemoIdempotencyKey('memo_due', normalized, dueAt),
        body: language === 'it'
          ? `Promemoria: ${normalized.title}. Fatto?`
          : `Reminder: ${normalized.title}. Done?`,
        metadata: {
          exact_due_reminder: true,
          quiet_hours_bypass: true,
          due_at: dueAt.toISOString(),
        },
        language,
      }));
    }

    const overdueAt = addMinutes(dueAt, OVERDUE_GRACE_MINUTES);
    if (nowDate >= overdueAt && nowDate <= addHours(dueAt, OVERDUE_EXPIRY_HOURS)) {
      const localDay = localDateFromInstant(nowDate);
      candidates.push(buildMemoCandidate({
        memo: normalized,
        recipient,
        ruleKey: 'memo_overdue_followup',
        priority: 'normal',
        scheduledFor: overdueAt,
        expiresAt: addHours(dueAt, OVERDUE_EXPIRY_HOURS),
        idempotencyKey: `memo_overdue:${normalized.id}:${localDay}`,
        body: language === 'it'
          ? `Questo promemoria e' ancora aperto: ${normalized.title}. Fatto, piu' tardi o annullo?`
          : `This reminder is still open: ${normalized.title}. Done, later, or cancel?`,
        metadata: {
          exact_due_reminder: false,
          due_at: dueAt.toISOString(),
          overdue_after_minutes: OVERDUE_GRACE_MINUTES,
        },
        language,
      }));
    }
  } else if (isDateOnlyMemoCheckDue(normalized.memo_date, nowDate)) {
    const checkAt = localDateTimeToUtcDate(normalized.memo_date, DATE_ONLY_CHECK_TIME);
    candidates.push(buildMemoCandidate({
      memo: normalized,
      recipient,
      ruleKey: 'date_only_memo_due_today',
      priority: 'low',
      scheduledFor: checkAt,
      expiresAt: addHours(checkAt, 12),
      idempotencyKey: `memo_date_only:${normalized.id}:${normalized.memo_date}`,
      body: language === 'it'
        ? `Promemoria per oggi: ${normalized.title}. A che ora vuoi che te lo ricordi?`
        : `Reminder for today: ${normalized.title}. What time should I remind you?`,
      metadata: {
        exact_due_reminder: false,
        date_only: true,
      },
      language,
    }));
  }

  return candidates;
}

export async function loadMemoProactiveContext({ userId = getActionUserId(), now = new Date() } = {}) {
  const nowDate = normalizeDate(now);
  const memoWindowStart = localDateFromInstant(new Date(nowDate.getTime() - OVERDUE_EXPIRY_HOURS * 60 * 60000));
  const memoWindowEnd = localDateFromInstant(nowDate);
  const memosResult = await getSupabaseAdmin()
    .from('memos')
    .select(MEMO_SELECT)
    .eq('user_id', userId)
    .eq('status', 'open')
    .not('memo_date', 'is', null)
    .gte('memo_date', memoWindowStart)
    .lte('memo_date', memoWindowEnd)
    .order('memo_date', { ascending: true })
    .order('memo_time', { ascending: true, nullsFirst: true });
  if (memosResult.error) throw memosResult.error;
  return { family: 'memo', memos: memosResult.data ?? [] };
}

export function buildMemoProactiveCandidatesFromContext({ context, now = new Date(), recipient } = {}) {
  return (context?.memos ?? []).flatMap((memo) => buildMemoProactiveCandidates({ memo, now, recipient }));
}

export async function shouldSuppressProactiveCandidate({ userId = getActionUserId(), candidate, now = new Date(), admitted = [] } = {}) {
  const nowDate = normalizeDate(now);
  if (!candidate?.recipient) return { suppressed: true, reason: 'missing_recipient' };
  if (!candidate?.body) return { suppressed: true, reason: 'empty_body' };
  if (candidate.expires_at && new Date(candidate.expires_at) <= nowDate) {
    return { suppressed: true, reason: 'expired' };
  }

  const client = getSupabaseAdmin();
  if (candidate.source_type === 'accountability' && await sourceIsResolved({ client, userId, sourceId: candidate.source_id, sourceType: candidate.source_type })) {
    return { suppressed: true, reason: 'source_resolved' };
  }
  const duplicate = await client
    .from('brain_outbox_messages')
    .select('id, status')
    .eq('user_id', userId)
    .eq('idempotency_key', candidate.idempotency_key)
    .limit(1)
    .maybeSingle();
  if (duplicate.error) throw duplicate.error;
  if (duplicate.data) return { suppressed: true, reason: 'duplicate' };

  if (candidate.rule_key === 'memo_overdue_followup') {
    const priorDue = await client
      .from('brain_outbox_messages')
      .select('id')
      .eq('user_id', userId)
      .eq('channel', candidate.channel)
      .eq('source_type', candidate.source_type)
      .eq('source_id', candidate.source_id)
      .eq('rule_key', 'timed_memo_due')
      .in('status', ['queued', 'claimed', 'sent'])
      .limit(1)
      .maybeSingle();
    if (priorDue.error) throw priorDue.error;
    if (!priorDue.data) return { suppressed: true, reason: 'prior_due_reminder_missing' };
  }

  const config = await loadProactiveRuleConfig({ userId, ruleKey: candidate.rule_key, channel: candidate.channel });
  const globalPreferences = await loadProactiveGlobalPreferences({ userId, channel: candidate.channel });
  if (!config.enabled) return { suppressed: true, reason: 'rule_disabled' };
  if (!globalPreferences.enabled) return { suppressed: true, reason: 'global_proactive_disabled' };
  const quietHoursBypass = Boolean(
    candidate.metadata?.exact_due_reminder
      || candidate.metadata?.quiet_hours_bypass
      || candidate.metadata?.attention_profile?.quiet_hours_bypass,
  );
  if (!quietHoursBypass && isWithinQuietHours(nowDate, config.quiet_hours_start, config.quiet_hours_end)) {
    return { suppressed: true, reason: 'quiet_hours' };
  }

  const preferences = applyCandidateAttentionProfile(
    mergeAttentionPreferences(config, globalPreferences),
    candidate.metadata?.attention_profile,
  );
  const attentionBudget = await getAttentionBudget({
    userId,
    channel: candidate.channel,
    now: nowDate,
    minGapMinutes: preferences.min_gap_minutes,
  });
  candidate.metadata.attention_profile = { ...candidate.metadata.attention_profile, ...preferences };
  attentionBudget.daily_count += admitted.length;
  if (admitted.length) attentionBudget.recent_message ||= { id: 'current_evaluation' };
  const attention = shouldSpendAttention({ candidate, preferences, attentionBudget, now: nowDate });
  if (!attention.allowed) return { suppressed: true, reason: attention.reason };

  return { suppressed: false, reason: null };
}

export async function loadProactiveRuleConfig({ userId = getActionUserId(), ruleKey, channel = 'whatsapp' } = {}) {
  const result = await getSupabaseAdmin()
    .from('brain_proactive_rules')
    .select('enabled, quiet_hours_start, quiet_hours_end, max_per_day, min_gap_minutes, config')
    .eq('user_id', userId)
    .eq('rule_key', ruleKey)
    .eq('channel', channel)
    .maybeSingle();
  if (result.error) throw result.error;
  return normalizeRuleConfig(result.data);
}

export async function loadProactiveGlobalPreferences({ userId = getActionUserId(), channel = 'whatsapp' } = {}) {
  const result = await getSupabaseAdmin()
    .from('brain_proactive_rules')
    .select('enabled, quiet_hours_start, quiet_hours_end, max_per_day, min_gap_minutes, config')
    .eq('user_id', userId)
    .eq('rule_key', 'global')
    .eq('channel', channel)
    .maybeSingle();
  if (result.error) throw result.error;
  return normalizeRuleConfig(result.data);
}

export async function getAttentionBudget({ userId = getActionUserId(), channel = 'whatsapp', now = new Date(), minGapMinutes = DEFAULT_MIN_GAP_MINUTES } = {}) {
  const nowDate = normalizeDate(now);
  const client = getSupabaseAdmin();
  const dayStart = startOfLocalDayUtcIso(nowDate);
  const daily = await client
    .from('brain_outbox_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('channel', channel)
    .gte('created_at', dayStart)
    .in('status', ['queued', 'claimed', 'sent', 'failed', 'expired']);
  if (daily.error) throw daily.error;

  let recent = null;
  if (Number(minGapMinutes ?? 0) > 0) {
    const since = new Date(nowDate.getTime() - Number(minGapMinutes) * 60000).toISOString();
    const recentResult = await client
      .from('brain_outbox_messages')
      .select('id, rule_key, created_at, status')
      .eq('user_id', userId)
      .eq('channel', channel)
      .gte('created_at', since)
      .in('status', ['queued', 'claimed', 'sent'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentResult.error) throw recentResult.error;
    recent = recentResult.data ?? null;
  }

  return {
    daily_count: Number(daily.count ?? 0),
    recent_message: recent,
    min_gap_minutes: Number(minGapMinutes ?? 0),
  };
}

export function shouldSpendAttention({ candidate, preferences, attentionBudget } = {}) {
  const maxPerDay = Number(preferences?.max_per_day ?? DEFAULT_MAX_PER_DAY);
  if (Number.isFinite(maxPerDay) && maxPerDay > 0 && Number(attentionBudget?.daily_count ?? 0) >= maxPerDay) {
    return { allowed: false, reason: 'daily_cap' };
  }
  const isExactDue = Boolean(candidate?.metadata?.exact_due_reminder || candidate?.metadata?.quiet_hours_bypass);
  if (!isExactDue && attentionBudget?.recent_message) {
    return { allowed: false, reason: 'min_gap' };
  }
  return { allowed: true, reason: null };
}

export function normalizeMemoForProactive(memo) {
  if (!memo || typeof memo !== 'object') return null;
  const id = cleanText(memo.id, 80);
  const title = cleanText(memo.title, 220);
  if (!id || !title) return null;
  return {
    id,
    user_id: cleanText(memo.user_id, 80),
    title,
    memo_date: normalizeDateString(memo.memo_date),
    memo_time: normalizeTimeString(memo.memo_time),
    notes: cleanText(memo.notes, 500),
    status: cleanText(memo.status, 40) || 'open',
  };
}

export function buildMemoIdempotencyKey(prefix, memo, dateValue) {
  const when = dateValue instanceof Date ? dateValue.toISOString() : String(dateValue ?? memo.memo_date ?? 'none');
  return `${prefix}:${memo.id}:${when}`;
}

export function localDateTimeToUtcDate(dateValue, timeValue) {
  const date = normalizeDateString(dateValue);
  const time = normalizeTimeString(timeValue);
  if (!date || !time) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  for (let index = 0; index < 3; index += 1) {
    const parts = localParts(utc);
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const target = Date.UTC(year, month - 1, day, hour, minute);
    utc = new Date(utc.getTime() - (actual - target));
  }
  return utc;
}

export function localDateFromInstant(value = new Date()) {
  const parts = localParts(normalizeDate(value));
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function isWithinQuietHours(value = new Date(), quietStart = DEFAULT_QUIET_START, quietEnd = DEFAULT_QUIET_END) {
  const parts = localParts(normalizeDate(value));
  const current = parts.hour * 60 + parts.minute;
  const start = timeToMinutes(normalizeTimeString(quietStart) || DEFAULT_QUIET_START);
  const end = timeToMinutes(normalizeTimeString(quietEnd) || DEFAULT_QUIET_END);
  if (start === end) return false;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function buildMemoCandidate({ memo, recipient, ruleKey, priority, scheduledFor, expiresAt, idempotencyKey, body, metadata, language }) {
  return {
    channel: 'whatsapp',
    recipient: cleanText(recipient, 180),
    body: cleanText(body, 1000),
    priority,
    rule_key: ruleKey,
    source_type: 'memo',
    source_id: memo.id,
    idempotency_key: idempotencyKey,
    scheduled_for: scheduledFor.toISOString(),
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    metadata: {
      created_by: 'brain_proactive_rules_v1',
      expected_reply_type: 'memo_done_snooze_cancel',
      language,
      memo: {
        id: memo.id,
        title: memo.title,
        memo_date: memo.memo_date,
        memo_time: memo.memo_time,
        status: memo.status,
      },
      proactive_trace: {
        rule_key: ruleKey,
        decision: 'candidate',
        idempotency_key: idempotencyKey,
        source_type: 'memo',
        source_id: memo.id,
        scheduled_for: scheduledFor.toISOString(),
        expires_at: expiresAt ? expiresAt.toISOString() : null,
      },
      ...metadata,
    },
  };
}

function normalizeRuleConfig(row) {
  return {
    enabled: row?.enabled ?? true,
    quiet_hours_start: normalizeTimeString(row?.quiet_hours_start) || DEFAULT_QUIET_START,
    quiet_hours_end: normalizeTimeString(row?.quiet_hours_end) || DEFAULT_QUIET_END,
    max_per_day: Number.isFinite(Number(row?.max_per_day)) ? Number(row.max_per_day) : DEFAULT_MAX_PER_DAY,
    min_gap_minutes: Number.isFinite(Number(row?.min_gap_minutes)) ? Number(row.min_gap_minutes) : DEFAULT_MIN_GAP_MINUTES,
    config: row?.config && typeof row.config === 'object' ? row.config : {},
  };
}

function mergeAttentionPreferences(ruleConfig, globalConfig) {
  const ruleMax = Number(ruleConfig?.max_per_day ?? DEFAULT_MAX_PER_DAY);
  const globalMax = Number(globalConfig?.max_per_day ?? DEFAULT_MAX_PER_DAY);
  const ruleGap = Number(ruleConfig?.min_gap_minutes ?? DEFAULT_MIN_GAP_MINUTES);
  const globalGap = Number(globalConfig?.min_gap_minutes ?? DEFAULT_MIN_GAP_MINUTES);
  return {
    enabled: Boolean(ruleConfig?.enabled && globalConfig?.enabled),
    max_per_day: Math.min(ruleMax, globalMax),
    min_gap_minutes: Math.max(ruleGap, globalGap),
  };
}

function applyCandidateAttentionProfile(preferences, profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return preferences;
  const maxPerDay = Number(profile.max_per_day);
  const minGapMinutes = Number(profile.min_gap_minutes);
  return {
    ...preferences,
    max_per_day: Number.isFinite(maxPerDay) ? Math.max(1, Math.trunc(maxPerDay)) : preferences.max_per_day,
    min_gap_minutes: Number.isFinite(minGapMinutes) ? Math.max(0, Math.trunc(minGapMinutes)) : preferences.min_gap_minutes,
  };
}

function isDateOnlyMemoCheckDue(memoDate, nowDate) {
  const today = localDateFromInstant(nowDate);
  if (memoDate > today) return false;
  const checkAt = localDateTimeToUtcDate(today, DATE_ONLY_CHECK_TIME);
  return nowDate >= checkAt && nowDate <= addHours(checkAt, 12);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function addHours(date, hours) {
  return addMinutes(date, hours * 60);
}

function startOfLocalDayUtcIso(value) {
  return localDateTimeToUtcDate(localDateFromInstant(value), '00:00').toISOString();
}

function detectLanguage(value) {
  const text = normalizeText(value);
  const italian = text.match(/\b(?:oggi|domani|promemoria|ricordami|fatto|annullo|piu|tardi|alle|cosa|devo)\b/g) ?? [];
  const english = text.match(/\b(?:today|tomorrow|reminder|done|cancel|later|what|time)\b/g) ?? [];
  return english.length > italian.length ? 'en' : 'it';
}

function normalizeDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? new Date() : value;
  const date = new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeDateString(value) {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeTimeString(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function localParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) => ['year', 'month', 'day', 'hour', 'minute'].includes(part.type))
      .map((part) => [part.type, Number(part.value)]),
  );
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value, max = 1000) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}
