export const HEALTH_HABITS = [
  { id: 'shower', label: 'Shower' },
  { id: 'creatine', label: 'Creatine' },
  { id: 'skin', label: 'Skin' },
];

const HEALTH_HABIT_IDS = new Set(HEALTH_HABITS.map((habit) => habit.id));

export function normalizeHabitId(value) {
  const text = String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (['shower', 'doccia', 'showered'].includes(text)) return 'shower';
  if (['creatine', 'creatina'].includes(text)) return 'creatine';
  if (['skin', 'skincare', 'skin care'].includes(text)) return 'skin';
  return '';
}

export function normalizeHabitEntry(value) {
  if (typeof value === 'number') {
    return { count: toCount(value), times: [] };
  }
  if (typeof value === 'boolean') {
    return { count: value ? 1 : 0, times: [] };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { count: 0, times: [] };
  }
  return {
    count: toCount(value.count ?? (value.done ? 1 : 0)),
    times: normalizeHabitTimes(value.times),
  };
}

export function normalizeHygieneObject(value) {
  if (Array.isArray(value)) {
    return value.reduce((result, item) => {
      if (!item || typeof item !== 'object') return result;
      const key = String(item.id ?? item.name ?? item.label ?? '').trim().toLowerCase();
      if (!key) return result;
      const trackedId = normalizeHabitId(key);
      result[trackedId || key] = trackedId
        ? normalizeHabitEntry(item)
        : { ...item };
      return result;
    }, {});
  }
  if (!value || typeof value !== 'object') return {};

  const result = { ...value };
  for (const habit of HEALTH_HABITS) {
    if (Object.prototype.hasOwnProperty.call(result, habit.id)) {
      result[habit.id] = normalizeHabitEntry(result[habit.id]);
    }
  }
  return result;
}

export function getHabitEntry(hygiene, habitId) {
  const normalizedId = normalizeHabitId(habitId);
  if (!normalizedId) return { count: 0, times: [] };
  const normalized = normalizeHygieneObject(hygiene);
  return normalizeHabitEntry(normalized[normalizedId]);
}

export function applyHabitUpdate(hygiene, { habit, amount = 1, mode = 'increment', time = null }) {
  const habitId = normalizeHabitId(habit);
  if (!HEALTH_HABIT_IDS.has(habitId)) return normalizeHygieneObject(hygiene);

  const normalized = normalizeHygieneObject(hygiene);
  const current = getHabitEntry(normalized, habitId);
  const safeAmount = toCount(amount);
  const nextCount = mode === 'set' ? safeAmount : current.count + safeAmount;
  let times = current.times.slice();

  if (mode === 'set') {
    if (time) times = nextCount > 0 ? [time] : [];
    else if (nextCount === 0) times = [];
  } else if (safeAmount > 0 && time) {
    times.push(time);
  }

  normalized[habitId] = {
    count: nextCount,
    times: normalizeHabitTimes(times),
  };
  return normalized;
}

export function normalizeHabitTimes(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((time) => String(time ?? '').trim())
    .filter((time) => /^\d{2}:[0-5]\d$/.test(time) && Number(time.slice(0, 2)) <= 23)
    .sort((a, b) => a.localeCompare(b));
}

function toCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}
