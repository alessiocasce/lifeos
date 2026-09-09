const SECRET_KEY_PATTERN = /secret|token|password|authorization|api[_-]?key|service[_-]?role/i;
const DEFAULT_LIMITS = Object.freeze({
  maxDepth: 7,
  maxObjectKeys: 40,
  maxArrayItems: 80,
  maxStringLength: 1000,
  maxNodes: 600,
});

const ACCOUNTABILITY_KINDS = new Set(['habit_missing', 'wake_time_missing', 'sleep_start_missing']);
const ACCOUNTABILITY_HABITS = new Set(['shower', 'creatine', 'skin']);

export function sanitizeBrainMetadata(value, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  return sanitizeValue(value, limits, 0, 'root', { nodes: 0 });
}

export function normalizeAccountabilityTarget(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const kind = ACCOUNTABILITY_KINDS.has(value.kind) ? value.kind : null;
  const localDate = validLocalDate(value.local_date) ? value.local_date : null;
  const sleepDate = validLocalDate(value.sleep_date) ? value.sleep_date : null;
  if (!kind) return null;
  if (kind === 'habit_missing') {
    if (!ACCOUNTABILITY_HABITS.has(value.habit_id) || !localDate) return null;
  } else if (kind === 'wake_time_missing' && !localDate) {
    return null;
  } else if (kind === 'sleep_start_missing' && !sleepDate) {
    return null;
  }
  return sanitizeBrainMetadata({
    kind,
    ...(value.habit_id ? { habit_id: value.habit_id } : {}),
    ...(localDate ? { local_date: localDate } : {}),
    ...(sleepDate ? { sleep_date: sleepDate } : {}),
    ...(value.field ? { field: String(value.field).slice(0, 60) } : {}),
    ...(Number.isFinite(Number(value.target_count)) ? { target_count: Math.max(1, Math.min(10, Number(value.target_count))) } : {}),
    ...(value.window_key ? { window_key: String(value.window_key).slice(0, 80) } : {}),
  });
}

export function normalizeProactiveAssistantTarget(metadata = {}, workingContext = null) {
  const raw = workingContext?.last_subject?.raw;
  const direct = normalizeAccountabilityTarget(metadata.accountability);
  const fallback = normalizeAccountabilityTarget(raw?.accountability);
  return direct || fallback;
}

function sanitizeValue(value, limits, depth, key, state) {
  if (SECRET_KEY_PATTERN.test(String(key))) return '[redacted]';
  state.nodes += 1;
  if (state.nodes > limits.maxNodes) return '[truncated]';
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, limits.maxStringLength);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= limits.maxDepth) return '[truncated]';
  if (Array.isArray(value)) {
    return value.slice(0, limits.maxArrayItems).map((item) => sanitizeValue(item, limits, depth + 1, key, state));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, limits.maxObjectKeys).map(([childKey, childValue]) => [
      childKey,
      sanitizeValue(childValue, limits, depth + 1, childKey, state),
    ]));
  }
  return String(value).slice(0, limits.maxStringLength);
}

function validLocalDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''));
}
