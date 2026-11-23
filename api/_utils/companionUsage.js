// Usage ledger, month-end projection and spend guard (spec §9).
//
// Every paid provider call writes one ledger row. The projection extrapolates
// variable spend linearly over the Europe/Rome calendar month and adds fixed
// subscriptions; the guard turns the projection into a behaviour level.

import { localDateTimeToUtcDate, TIME_ZONE } from './date.js';
import { roundUsd } from './companionPricing.js';

export const USAGE_PURPOSES = Object.freeze(['chat', 'proactive', 'call', 'eval', 'sync', 'email', 'other']);
export const SPEND_GUARD_LEVELS = Object.freeze({ normal: 'normal', reduced: 'reduced', essential: 'essential' });

const LEDGER_TABLE = 'brain_usage_ledger';
const DEFAULT_BUDGET_EUR = 30;
// USD per EUR. An estimate for budgeting only; override with COMPANION_USD_PER_EUR.
const DEFAULT_USD_PER_EUR = 1.15;
// ElevenLabs Starter ($6/month) counts inside the €30 trial (spec §11, R5).
const DEFAULT_FIXED_MONTHLY_USD = 6;
const REDUCED_RATIO = 0.8;
const MIN_ELAPSED_FRACTION_DAYS = 1;

export function companionBudget(env = process.env) {
  const budgetEur = positiveNumber(env?.COMPANION_MONTHLY_BUDGET_EUR, DEFAULT_BUDGET_EUR);
  const usdPerEur = positiveNumber(env?.COMPANION_USD_PER_EUR, DEFAULT_USD_PER_EUR);
  const fixedMonthlyUsd = nonNegativeNumber(env?.COMPANION_FIXED_MONTHLY_USD, DEFAULT_FIXED_MONTHLY_USD);
  return { budgetEur, usdPerEur, budgetUsd: roundUsd(budgetEur * usdPerEur), fixedMonthlyUsd };
}

export function toLedgerRow(userId, entry) {
  if (!userId) throw new Error('A usage ledger row needs a user id.');
  const purpose = USAGE_PURPOSES.includes(entry.purpose) ? entry.purpose : 'other';
  const count = (value) => Math.max(0, Math.round(Number(value) || 0));
  return {
    user_id: userId,
    occurred_at: entry.occurredAt ?? new Date().toISOString(),
    provider: String(entry.provider ?? '').slice(0, 40),
    model: String(entry.model ?? '').slice(0, 120),
    tier: entry.tier ?? null,
    purpose,
    input_tokens: count(entry.inputTokens),
    output_tokens: count(entry.outputTokens),
    cache_read_tokens: count(entry.cacheReadTokens),
    cache_write_tokens: count(entry.cacheWriteTokens),
    call_seconds: count(entry.callSeconds),
    estimated_cost_usd: roundUsd(Math.max(0, Number(entry.estimatedCostUsd) || 0)),
    request_id: entry.requestId ? String(entry.requestId).slice(0, 160) : null,
    metadata: entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {},
  };
}

export function createSupabaseUsageSink({ supabase, userId }) {
  return async (entry) => {
    const { error } = await supabase.from(LEDGER_TABLE).insert(toLedgerRow(userId, entry));
    if (error) throw new Error(`usage ledger insert failed: ${error.message}`);
  };
}

export function createMemoryUsageSink() {
  const entries = [];
  return { entries, sink: async (entry) => { entries.push(entry); } };
}

// Europe/Rome calendar month containing `now`, as UTC instants.
export function romeMonthWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' })
    .formatToParts(now)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const year = Number(parts.year);
  const month = Number(parts.month);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const pad = (value) => String(value).padStart(2, '0');
  return {
    start: localDateTimeToUtcDate(`${year}-${pad(month)}-01`, '00:00'),
    end: localDateTimeToUtcDate(`${nextYear}-${pad(nextMonth)}-01`, '00:00'),
  };
}

export async function loadMonthToDateSpendUsd({ supabase, userId, now = new Date() }) {
  const { start, end } = romeMonthWindow(now);
  const { data, error } = await supabase
    .from(LEDGER_TABLE)
    .select('estimated_cost_usd')
    .eq('user_id', userId)
    .gte('occurred_at', start.toISOString())
    .lt('occurred_at', end.toISOString());
  if (error) throw new Error(`usage ledger read failed: ${error.message}`);
  return roundUsd((data ?? []).reduce((sum, row) => sum + (Number(row.estimated_cost_usd) || 0), 0));
}

export function projectMonthEndSpend({ variableSpentUsd, now = new Date(), fixedMonthlyUsd = DEFAULT_FIXED_MONTHLY_USD }) {
  const { start, end } = romeMonthWindow(now);
  const monthMs = end.getTime() - start.getTime();
  const minElapsedMs = MIN_ELAPSED_FRACTION_DAYS * 24 * 3600 * 1000;
  const elapsedMs = Math.min(monthMs, Math.max(minElapsedMs, now.getTime() - start.getTime()));
  const variable = Math.max(0, Number(variableSpentUsd) || 0);
  const projectedVariableUsd = roundUsd(variable * (monthMs / elapsedMs));
  return {
    monthStart: start.toISOString(),
    monthEnd: end.toISOString(),
    elapsedFraction: Math.round((elapsedMs / monthMs) * 1000) / 1000,
    variableSpentUsd: roundUsd(variable),
    projectedVariableUsd,
    fixedMonthlyUsd,
    projectedTotalUsd: roundUsd(projectedVariableUsd + fixedMonthlyUsd),
  };
}

// normal: everything allowed. reduced (≥80%): low-value calls become texts and
// reminder calls stop. essential (≥100%): only the morning call, escalation and
// critical calls remain. Callers enforce the behaviour; this only classifies.
export function spendGuardLevel({ projectedTotalUsd, budgetUsd }) {
  const ratio = budgetUsd > 0 ? projectedTotalUsd / budgetUsd : Infinity;
  const level = ratio >= 1 ? SPEND_GUARD_LEVELS.essential
    : ratio >= REDUCED_RATIO ? SPEND_GUARD_LEVELS.reduced
      : SPEND_GUARD_LEVELS.normal;
  return { level, ratio: Math.round(ratio * 1000) / 1000 };
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegativeNumber(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
