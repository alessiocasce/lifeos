export const TIME_ZONE = 'Europe/Rome';

export function localDate(offsetDays = 0) {
  const parts = getLocalParts(new Date());
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays));
  return date.toISOString().slice(0, 10);
}

export function localTime() {
  const parts = getLocalParts(new Date());
  return `${String(parts.hour % 24).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function localDateTime(offsetMinutes = 0) {
  const parts = getLocalParts(new Date(Date.now() + offsetMinutes * 60000));
  return {
    date: `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    time: `${String(parts.hour % 24).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
  };
}

export function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getLocalParts(date) {
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
