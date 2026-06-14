export const HEALTH_HABITS = [
  { id: 'shower', label: 'Shower' },
  { id: 'creatine', label: 'Creatine' },
  { id: 'skin', label: 'Skin' },
];

export function normalizeHabitEntry(value) {
  if (typeof value === 'number') return { count: toCount(value), times: [] };
  if (typeof value === 'boolean') return { count: value ? 1 : 0, times: [] };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { count: 0, times: [] };
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
      result[key] = HEALTH_HABITS.some((habit) => habit.id === key)
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
  return normalizeHabitEntry(normalizeHygieneObject(hygiene)[habitId]);
}

export function buildHabitUpdate(hygiene, habitId, delta, time) {
  const normalized = normalizeHygieneObject(hygiene);
  const current = getHabitEntry(normalized, habitId);
  const nextCount = Math.max(0, current.count + delta);
  const times = current.times.slice();
  if (delta > 0 && time) times.push(time);
  if (delta < 0 && times.length) times.pop();
  normalized[habitId] = {
    count: nextCount,
    times: normalizeHabitTimes(times),
  };
  return normalized;
}

export function formatHabitTimes(times) {
  return normalizeHabitTimes(times).join(' · ');
}

function normalizeHabitTimes(value) {
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
