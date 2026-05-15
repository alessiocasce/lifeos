import { HttpError } from './http.js';

export const today = () => new Date().toISOString().slice(0, 10);

const CANONICAL_EXPENSE_CATEGORIES = [
  'Food',
  'Groceries',
  'Transport',
  'Car',
  'Shopping',
  'Health',
  'Entertainment',
  'Bills',
  'Subscriptions',
  'Education',
  'Travel',
  'Personal Care',
  'Other',
];

const EXPENSE_CATEGORY_ALIASES = new Map([
  ['subscription', 'Subscriptions'],
  ['subscriptions', 'Subscriptions'],
  ['bill', 'Bills'],
  ['bills', 'Bills'],
  ['grocery', 'Groceries'],
  ['groceries', 'Groceries'],
  ['personal care', 'Personal Care'],
]);

export function compactPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

export function optionalText(value, field = 'value', { max = Infinity } = {}) {
  if (value === undefined) return undefined;
  const text = String(value ?? '').trim();
  if (!text) return null;
  validateMaxLength(text, field, max);
  return text;
}

export function requiredText(body, field, { max = Infinity } = {}) {
  const text = String(body[field] ?? '').trim();
  if (!text) throw new HttpError(400, `${field} is required.`);
  validateMaxLength(text, field, max);
  return text;
}

export function optionalDate(body, field, fallback = undefined) {
  if (body[field] === undefined || body[field] === null || body[field] === '') return fallback;
  const value = normalizeDateValue(body[field]);
  if (!isValidDate(value)) throw new HttpError(400, `${field} must be a valid date in YYYY-MM-DD, DD/MM/YY, or DD/MM/YYYY format.`);
  return value;
}

export function requiredDate(body, field) {
  const value = optionalDate(body, field);
  if (!value) throw new HttpError(400, `${field} is required.`);
  return value;
}

export function optionalTime(body, field) {
  if (!hasField(body, field)) return undefined;
  if (body[field] === null || body[field] === '') {
    throw new HttpError(400, `${field} must be a valid time such as HH:MM, 2:15pm, or 9am.`);
  }
  const value = normalizeTimeValue(body[field]);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new HttpError(400, `${field} must be a valid time such as HH:MM, 2:15pm, or 9am.`);
  }
  return value;
}

export function optionalNullableTime(body, field) {
  if (!hasField(body, field)) return undefined;
  if (body[field] === null || body[field] === '') return null;
  return optionalTime(body, field);
}

export function normalizeTimeRange(body, startField = 'start_time', endField = 'end_time') {
  const startTime = optionalNullableTime(body, startField);
  const endTime = optionalNullableTime(body, endField);
  if (!startTime || !endTime || !shouldPromoteAmbiguousStartToPm(body[startField], body[endField], startTime, endTime)) {
    return { startTime, endTime };
  }
  return {
    startTime: addHours(startTime, 12),
    endTime,
  };
}

export function optionalNumber(body, field, { min = -Infinity, max = Infinity } = {}) {
  if (!hasField(body, field)) return undefined;
  if (body[field] === null || body[field] === '') {
    throw new HttpError(400, `${field} must be ${formatRange('a number', min, max)}.`);
  }
  const value = parseDecimal(body[field]);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(400, `${field} must be ${formatRange('a number', min, max)}.`);
  }
  return value;
}

export function optionalNullableNumber(body, field, { min = -Infinity, max = Infinity } = {}) {
  if (!hasField(body, field)) return undefined;
  if (body[field] === null || body[field] === '') return null;
  return optionalNumber(body, field, { min, max });
}

export function requiredPositiveNumber(body, field) {
  return requiredNumber(body, field, { minExclusive: 0 });
}

export function requiredNumber(body, field, { min = -Infinity, minExclusive = null, max = Infinity } = {}) {
  const value = parseDecimal(body[field]);
  const minOk = minExclusive === null ? value >= min : value > minExclusive;
  if (!Number.isFinite(value) || !minOk || value > max) {
    throw new HttpError(400, `${field} must be ${formatRange('a number', minExclusive ?? min, max, minExclusive !== null)}.`);
  }
  return value;
}

export function optionalInteger(body, field, { min = -Infinity, max = Infinity } = {}) {
  if (!hasField(body, field)) return undefined;
  if (body[field] === null || body[field] === '') {
    throw new HttpError(400, `${field} must be ${formatRange('an integer', min, max)}.`);
  }
  const value = parseDecimal(body[field]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, `${field} must be ${formatRange('an integer', min, max)}.`);
  }
  return value;
}

export function optionalNullableInteger(body, field, { min = -Infinity, max = Infinity } = {}) {
  if (!hasField(body, field)) return undefined;
  if (body[field] === null || body[field] === '') return null;
  return optionalInteger(body, field, { min, max });
}

export function parseDecimal(value) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[€$£]/g, '')
    .replace(/\b(euros?|eur|dollars?|usd)\b/g, '')
    .replace(',', '.');
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

export function normalizeTimeValue(value) {
  const text = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

  const meridiemMatch = text.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/);
  if (meridiemMatch) {
    let hours = Number(meridiemMatch[1]);
    const minutes = Number(meridiemMatch[2] ?? '0');
    const meridiem = meridiemMatch[3];
    if (!Number.isInteger(hours) || hours < 1 || hours > 12) return text;
    if (meridiem === 'am') {
      hours = hours === 12 ? 0 : hours;
    } else {
      hours = hours === 12 ? 12 : hours + 12;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const twentyFourHourMatch = text.match(/^(\d{1,2}):([0-5]\d)$/);
  if (twentyFourHourMatch) {
    const hours = Number(twentyFourHourMatch[1]);
    const minutes = Number(twentyFourHourMatch[2]);
    if (!Number.isInteger(hours) || hours < 0 || hours > 23) return text;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  return text;
}

export function normalizeExpenseCategory(category) {
  if (category === undefined || category === null) return category;
  const text = String(category).trim();
  if (!text) return text;

  const key = normalizeCategoryKey(text);
  const canonical = CANONICAL_EXPENSE_CATEGORIES.find((item) => normalizeCategoryKey(item) === key)
    ?? EXPENSE_CATEGORY_ALIASES.get(key);
  return canonical ?? titleCaseCategory(text);
}

export function assertTimeOrder(startTime, endTime) {
  if (!startTime || !endTime) return;
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    throw new HttpError(400, 'end_time must be later than start_time.');
  }
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeDateValue(value) {
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const european = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!european) return text;

  const day = Number(european[1]);
  const month = Number(european[2]);
  const rawYear = Number(european[3]);
  const year = european[3].length === 2 ? 2000 + rawYear : rawYear;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function hasField(body, field) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function normalizeCategoryKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function titleCaseCategory(value) {
  return normalizeCategoryKey(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatRange(label, min, max, exclusiveMin = false) {
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return `${label} ${exclusiveMin ? 'greater than' : 'between'} ${min}${exclusiveMin ? ` and less than or equal to ${max}` : ` and ${max}`}`;
  }
  if (Number.isFinite(min)) return `${label} ${exclusiveMin ? 'greater than' : 'greater than or equal to'} ${min}`;
  if (Number.isFinite(max)) return `${label} less than or equal to ${max}`;
  return label;
}

function validateMaxLength(value, field, max) {
  if (Number.isFinite(max) && value.length > max) {
    throw new HttpError(400, `${field} must be ${max} characters or fewer.`);
  }
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function shouldPromoteAmbiguousStartToPm(rawStart, rawEnd, startTime, endTime) {
  if (!isAmbiguousUnmarkedTime(rawStart)) return false;
  if (hasMeridiem(rawStart)) return false;

  const startHours = Number(startTime.slice(0, 2));
  if (startHours < 1 || startHours > 11) return false;

  const shiftedStart = timeToMinutes(startTime) + 12 * 60;
  const endMinutes = timeToMinutes(endTime);
  const endLooksAfternoon = hasPmMeridiem(rawEnd) || Number(endTime.slice(0, 2)) >= 13;
  return endLooksAfternoon && shiftedStart < endMinutes;
}

function isAmbiguousUnmarkedTime(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (hasMeridiem(text)) return false;
  const match = text.match(/^(\d{1,2}):[0-5]\d$/);
  if (!match) return false;
  if (text.startsWith('0')) return false;
  const hours = Number(match[1]);
  return hours >= 1 && hours <= 11;
}

function hasMeridiem(value) {
  return /\b(?:am|pm)\b/i.test(String(value ?? '').replace(/\s+/g, ' ')) || /(?:am|pm)$/i.test(String(value ?? '').trim());
}

function hasPmMeridiem(value) {
  return /\bpm\b/i.test(String(value ?? '').replace(/\s+/g, ' ')) || /pm$/i.test(String(value ?? '').trim());
}

function addHours(value, hoursToAdd) {
  const minutes = timeToMinutes(value) + hoursToAdd * 60;
  const hours = Math.floor(minutes / 60) % 24;
  const minutesRemainder = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutesRemainder).padStart(2, '0')}`;
}
