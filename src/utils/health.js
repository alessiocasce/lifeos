export function calculateSleepHoursFromTimes(previousSleepStart, wakeTime) {
  const startMinutes = parseTime(previousSleepStart);
  const wakeMinutes = parseTime(wakeTime);
  if (startMinutes === null || wakeMinutes === null) return null;

  let durationMinutes = wakeMinutes - startMinutes;
  if (durationMinutes <= 0) durationMinutes += 24 * 60;
  if (durationMinutes <= 0 || durationMinutes > 24 * 60) return null;
  return Math.round((durationMinutes / 60) * 2) / 2;
}

function parseTime(value) {
  const match = String(value ?? '').match(/^(\d{2}):([0-5]\d)/);
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours < 0 || hours > 23) return null;
  return hours * 60 + Number(match[2]);
}
