import { addDays, localDate } from './date.js';
import { normalizeTimeValue, optionalDate } from './validation.js';

const CALENDAR_MISSING_ORDER = ['title', 'date', 'start_time', 'end_time'];

export function normalizeBrainDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value === 'today_local') return localDate();
  if (value === 'tomorrow_local') return addDays(localDate(), 1);
  try {
    return optionalDate({ value }, 'value', null);
  } catch {
    return null;
  }
}

export function normalizeBrainTime(value, suffix = '') {
  if (value === undefined || value === null || value === '') return null;
  let text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (suffix) text = `${text} ${suffix}`;
  text = text
    .replace(/\bdi\s+sera\b/g, 'pm')
    .replace(/\bdi\s+mattina\b/g, 'am')
    .replace(/\bmezzanotte\b/g, '00:00')
    .replace(/\bmezzogiorno\b/g, '12:00');

  const normalized = normalizeTimeValue(text);
  if (/^\d{2}:\d{2}$/.test(normalized)) return normalized;

  const fallback = text.replace('.', ':').match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?$/);
  if (!fallback) return null;
  let hour = Number(fallback[1]);
  const minute = Number(fallback[2] ?? 0);
  const period = fallback[3] ?? '';
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (period) {
    if (hour < 1 || hour > 12) return null;
    if (period === 'am') hour = hour === 12 ? 0 : hour;
    if (period === 'pm') hour = hour === 12 ? 12 : hour + 12;
  }
  if (hour < 0 || hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function normalizeCalendarEventArgs(args = {}, { sourceMessage = '' } = {}) {
  const source = safeObject(args);
  const { source_user_message: embeddedSourceMessage, ...publicSource } = source;
  const sourceFields = extractCalendarFieldsFromSourceMessage(sourceMessage || embeddedSourceMessage);
  const rawStart = source.start_time ?? source.time;
  const rawEnd = source.end_time;
  let startTime = normalizeBrainTime(rawStart);
  let endTime = normalizeBrainTime(rawEnd);

  if (sourceFields.start_time && (!startTime || shouldPreferSourceStartTime({ rawStart, startTime, sourceFields }))) {
    startTime = sourceFields.start_time;
  }
  if (sourceFields.end_time && !endTime) endTime = sourceFields.end_time;

  const durationMinutes = normalizeDurationMinutes(source.duration_minutes ?? source.duration);
  if (startTime && !endTime && durationMinutes) {
    endTime = addMinutesToTime(startTime, durationMinutes);
  }

  return {
    ...publicSource,
    title: cleanText(source.title ?? source.name, 180),
    event_date: normalizeBrainDate(source.event_date || source.date || sourceFields.event_date),
    start_time: startTime,
    end_time: endTime,
    duration_minutes: durationMinutes ?? source.duration_minutes,
    category: cleanText(source.category, 80),
    location: cleanText(source.location, 200),
    notes: cleanText(source.notes, 1000),
  };
}

export function validateCalendarEventArgs(args = {}, currentMissing = []) {
  const missing = new Set(
    (Array.isArray(currentMissing) ? currentMissing : [])
      .map(normalizeMissingField)
      .filter(Boolean),
  );
  const normalized = safeObject(args);
  if (!normalized.title) missing.add('title');
  if (!normalized.event_date) missing.add('date');
  if (!normalized.start_time) missing.add('start_time');
  if (!normalized.end_time) missing.add('end_time');
  if (normalized.start_time && normalized.end_time && !isEndAfterStart(normalized.start_time, normalized.end_time)) {
    missing.add('end_time');
  }

  for (const field of [...missing]) {
    if (field === 'time') {
      missing.delete(field);
      if (!normalized.start_time) missing.add('start_time');
      else if (!normalized.end_time) missing.add('end_time');
    }
    if (field === 'duration') {
      missing.delete(field);
      if (!normalized.end_time) missing.add('end_time');
    }
    if (field === 'date' && normalized.event_date) missing.delete(field);
    if (field === 'event_date' && normalized.event_date) missing.delete(field);
    if (field === 'start_time' && normalized.start_time) missing.delete(field);
    if (field === 'end_time' && normalized.end_time && isEndAfterStart(normalized.start_time, normalized.end_time)) missing.delete(field);
    if (field === 'title' && normalized.title) missing.delete(field);
  }

  return CALENDAR_MISSING_ORDER.filter((field) => missing.has(field));
}

export function buildCalendarEventClarification({ args = {}, missingFields = [], language = 'en' } = {}) {
  const missing = new Set(Array.isArray(missingFields) ? missingFields : []);
  const italian = language === 'it';
  const start = args?.start_time;
  const end = args?.end_time;
  const invalidEnd = start && end && !isEndAfterStart(start, end);

  if (missing.has('title')) {
    return italian ? 'Che titolo devo usare per l\'evento?' : 'What title should I use for the event?';
  }
  if (missing.has('date')) {
    return italian ? 'Che giorno devo usare per l\'evento?' : 'What date should I use for the event?';
  }
  if (missing.has('start_time') && missing.has('end_time')) {
    return italian
      ? 'Che orario di inizio e fine devo usare? Per esempio 14:30-15:30.'
      : 'What start and end time should I use? For example 14:30-15:30.';
  }
  if (missing.has('start_time')) {
    return italian ? 'A che ora inizia l\'evento?' : 'What time does the event start?';
  }
  if (missing.has('end_time')) {
    if (invalidEnd) {
      return italian
        ? `Ho l'inizio alle ${start}, ma la fine deve essere dopo. A che ora finisce o quanto dura?`
        : `I have the start at ${start}, but the end must be later. What end time or duration should I use?`;
    }
    if (start) {
      return italian
        ? `Ho l'orario di inizio: ${start}. Quanto dura? Posso mettere 1 ora?`
        : `I have the start time: ${start}. How long does it last? Should I use 1 hour?`;
    }
    return italian ? 'Quanto dura l\'evento o a che ora finisce?' : 'How long does the event last, or what time does it end?';
  }
  return null;
}

export function extractCalendarEventFieldUpdate(message, pendingAction = {}) {
  const action = safeObject(pendingAction);
  if (action.action_type !== 'create_calendar_event') return null;
  const text = String(message ?? '').trim();
  if (!text) return null;
  const normalizedArgs = normalizeCalendarEventArgs(action.args);
  const missing = validateCalendarEventArgs(normalizedArgs, action.missing_fields);
  const durationMinutes = parseDurationMinutes(text);
  if (durationMinutes && normalizedArgs.start_time) {
    const endTime = addMinutesToTime(normalizedArgs.start_time, durationMinutes);
    if (endTime) {
      return {
        relation: 'field_update',
        args_patch: { duration_minutes: durationMinutes, end_time: endTime },
        missing_fields: [],
        confirmation_required: false,
      };
    }
  }

  const explicitEnd = parseExplicitEndTime(text);
  if (explicitEnd) {
    return {
      relation: 'field_update',
      args_patch: { end_time: explicitEnd },
      missing_fields: [],
      confirmation_required: false,
    };
  }

  const sourceFields = extractCalendarFieldsFromSourceMessage(text);
  if (sourceFields.start_time && sourceFields.end_time) {
    return {
      relation: 'field_update',
      args_patch: { start_time: sourceFields.start_time, end_time: sourceFields.end_time },
      missing_fields: [],
      confirmation_required: false,
    };
  }

  if (sourceFields.start_time) {
    if (missing.includes('end_time') && normalizedArgs.start_time && !missing.includes('start_time')) {
      return {
        relation: 'field_update',
        args_patch: { end_time: sourceFields.start_time },
        missing_fields: [],
        confirmation_required: false,
      };
    }
    if (missing.includes('start_time')) {
      return {
        relation: 'field_update',
        args_patch: { start_time: sourceFields.start_time },
        missing_fields: missing.filter((field) => field !== 'start_time'),
        confirmation_required: false,
      };
    }
  }
  return null;
}

export function isCalendarEventSlotFillMessage(message, pendingAction = {}) {
  return Boolean(extractCalendarEventFieldUpdate(message, pendingAction));
}

export function extractCalendarFieldsFromSourceMessage(sourceMessage = '') {
  const text = String(sourceMessage ?? '');
  const eventDate = parseDateFromText(text);
  const range = parseTimeRangeFromText(text);
  if (range) {
    return {
      event_date: eventDate,
      start_time: range.start_time,
      end_time: range.end_time,
      explicit_meridiem: range.explicit_meridiem,
    };
  }
  const single = parseSingleTimeFromText(text);
  return {
    event_date: eventDate,
    start_time: single?.time ?? null,
    end_time: null,
    explicit_meridiem: Boolean(single?.explicit_meridiem),
  };
}

export function addMinutesToTime(time, minutes) {
  if (!time || !Number.isFinite(Number(minutes))) return null;
  const [hour, minute] = time.split(':').map(Number);
  const total = hour * 60 + minute + Number(minutes);
  if (total <= 0 || total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function isEndAfterStart(startTime, endTime) {
  if (!startTime || !endTime) return false;
  return timeToMinutes(endTime) > timeToMinutes(startTime);
}

function shouldPreferSourceStartTime({ rawStart, startTime, sourceFields }) {
  if (!sourceFields?.explicit_meridiem) return false;
  if (!startTime) return true;
  const rawText = String(rawStart ?? '').toLowerCase();
  if (/\b(?:am|pm|di\s+sera|di\s+mattina)\b/.test(rawText)) return false;
  return startTime !== sourceFields.start_time;
}

function parseDateFromText(text) {
  const match = String(text ?? '').match(/\b(\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4}))\b/);
  return match ? normalizeBrainDate(match[1]) : null;
}

function parseTimeRangeFromText(text) {
  const source = String(text ?? '');
  const pattern = /(?:^|[^\d/])(?:dalle|da|from)?\s*(\d{1,2}(?::|\.)?(?:[0-5]\d)?)\s*(am|pm)?\s*(?:-|–|—|to|until|fino\s+a|fino\s+alle|alle|a)\s*(\d{1,2}(?::|\.)?(?:[0-5]\d)?)\s*(am|pm|di\s+sera|di\s+mattina)?(?=$|[^a-z0-9/])/i;
  const match = source.match(pattern);
  if (!match) return null;
  const endSuffix = match[4] || '';
  const startSuffix = match[2] || inferStartSuffix(match[1], match[3], endSuffix);
  const start = normalizeBrainTime(match[1], startSuffix);
  const end = normalizeBrainTime(match[3], endSuffix);
  if (!start || !end) return null;
  return {
    start_time: start,
    end_time: end,
    explicit_meridiem: Boolean(startSuffix || endSuffix),
  };
}

function parseSingleTimeFromText(text) {
  const source = String(text ?? '');
  const patterns = [
    /(?:^|[^\d/])(\d{1,2}(?::|\.)[0-5]\d)\s*(am|pm|di\s+sera|di\s+mattina)?(?=$|[^a-z0-9/])/i,
    /\b(?:alle|all'|at)\s*(\d{1,2}(?::|\.)(?:[0-5]\d)|\d{1,2})\s*(am|pm|di\s+sera|di\s+mattina)?\b/i,
    /(?:^|[^\d/])(\d{1,2})\s*(am|pm)\b/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const time = normalizeBrainTime(match[1], match[2] || '');
    if (time) return { time, explicit_meridiem: Boolean(match[2]) };
  }
  return null;
}

function parseExplicitEndTime(text) {
  const source = String(text ?? '');
  const match = source.match(/\b(?:fine|finisce|fino\s+a|fino\s+alle|ends?\s+at|until)\s*(\d{1,2}(?::|\.)(?:[0-5]\d)|\d{1,2})\s*(am|pm|di\s+sera|di\s+mattina)?\b/i);
  return match ? normalizeBrainTime(match[1], match[2] || '') : null;
}

function parseDurationMinutes(text) {
  const normalized = normalizeText(text);
  if (/\b(?:mezz'?ora|mezza ora|half an hour)\b/.test(normalized)) return 30;
  if (/\b(?:un'?ora|una ora|one hour|an hour)\b/.test(normalized)) return 60;
  const hourMinute = normalized.match(/\b(?:durata\s*)?(\d+(?:[,.]\d+)?)\s*(?:h|ora|ore|hours?)\s*(?:(\d{1,2})\s*(?:m|min|minuti|minutes?))?\b/);
  if (hourMinute) {
    const hours = Number(hourMinute[1].replace(',', '.'));
    const minutes = Number(hourMinute[2] ?? 0);
    const total = Math.round(hours * 60 + minutes);
    return total > 0 && total <= 12 * 60 ? total : null;
  }
  const minute = normalized.match(/\b(?:durata\s*)?(\d{1,3})\s*(?:m|min|minuti|minutes?)\b/);
  if (minute) {
    const total = Number(minute[1]);
    return total > 0 && total <= 12 * 60 ? total : null;
  }
  return null;
}

function normalizeDurationMinutes(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value > 0 && value <= 12 * 60 ? Math.round(value) : null;
  const parsed = parseDurationMinutes(String(value));
  if (parsed) return parsed;
  const numeric = Number(String(value).replace(',', '.'));
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 12 * 60 ? Math.round(numeric) : null;
}

function inferStartSuffix(startValue, endValue, endSuffix) {
  const suffix = String(endSuffix ?? '').toLowerCase();
  if (suffix !== 'pm') return suffix;
  const startHour = Number(String(startValue).split(/[:.]/)[0]);
  const endHour = Number(String(endValue).split(/[:.]/)[0]);
  if (startHour === 12) return 'pm';
  if (startHour > endHour) return 'am';
  return 'pm';
}

function normalizeMissingField(value) {
  const field = String(value ?? '').trim().toLowerCase().replace(/[^\w_]/g, '').slice(0, 80);
  if (field === 'event_date' || field === 'memo_date') return 'date';
  if (field === 'time') return 'time';
  if (field === 'duration_minutes') return 'duration';
  return field;
}

function timeToMinutes(value) {
  const [hour, minute] = String(value).split(':').map(Number);
  return hour * 60 + minute;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanText(value, max = 1000) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/['\u2019]/g, "'")
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
