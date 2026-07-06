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

export function localDateTimeToUtcDate(dateValue, timeValue = '00:00', timeZone = TIME_ZONE) {
  const date = normalizeDateString(dateValue);
  const time = normalizeTimeString(timeValue);
  if (!date || !time) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  for (let index = 0; index < 3; index += 1) {
    const parts = getLocalPartsForTimeZone(utc, timeZone);
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const target = Date.UTC(year, month - 1, day, hour, minute);
    utc = new Date(utc.getTime() - (actual - target));
  }
  return utc;
}

export function startOfLocalDayUtcIso(dateValue = localDate(), timeZone = TIME_ZONE) {
  const date = normalizeInputDate(dateValue, timeZone);
  return localDateTimeToUtcDate(date, '00:00', timeZone).toISOString();
}

export function endOfLocalDayUtcIso(dateValue = localDate(), timeZone = TIME_ZONE) {
  const date = normalizeInputDate(dateValue, timeZone);
  const next = addDays(date, 1);
  return new Date(localDateTimeToUtcDate(next, '00:00', timeZone).getTime() - 1).toISOString();
}

export function localDateRangeToUtcIso({ date, timeZone = TIME_ZONE } = {}) {
  const local = normalizeInputDate(date ?? localDate(), timeZone);
  return {
    start: startOfLocalDayUtcIso(local, timeZone),
    end: endOfLocalDayUtcIso(local, timeZone),
  };
}

export function localRangeToUtcWindow({ startDate, endDate, timeZone = TIME_ZONE } = {}) {
  const start = normalizeInputDate(startDate ?? localDate(), timeZone);
  const end = normalizeInputDate(endDate ?? start, timeZone);
  return {
    start: startOfLocalDayUtcIso(start, timeZone),
    end: endOfLocalDayUtcIso(end, timeZone),
  };
}

function getLocalParts(date) {
  return getLocalPartsForTimeZone(date, TIME_ZONE);
}

function getLocalPartsForTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
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

function normalizeInputDate(value, timeZone) {
  if (value instanceof Date) {
    const parts = getLocalPartsForTimeZone(value, timeZone);
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }
  const text = String(value ?? '').trim();
  return normalizeDateString(text) || localDate();
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
