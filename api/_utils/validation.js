import { HttpError } from './http.js';
import { localDate } from './date.js';

export const today = () => localDate();

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
  const parsed = readTimeField(body, field);
  if (!parsed.present) return undefined;
  if (parsed.empty || parsed.invalid) throw timeFormatError(field);
  return parsed.tokens[0].normalized;
}

export function optionalNullableTime(body, field) {
  const parsed = readTimeField(body, field);
  if (!parsed.present) return undefined;
  if (parsed.empty) return null;
  if (parsed.invalid) throw timeFormatError(field);
  return parsed.tokens[0].normalized;
}

export function normalizeTimeRange(body, startField = 'start_time', endField = 'end_time') {
  const start = readTimeField(body, startField);
  const end = readTimeField(body, endField);

  if (start.invalid) throw timeFormatError(startField);
  if (end.invalid && start.tokens.length < 2) throw timeFormatError(endField);

  let startToken = start.tokens[0] ?? null;
  let endToken = end.invalid ? null : end.tokens[0] ?? null;

  if (!endToken && start.tokens.length >= 2) {
    endToken = start.tokens[1];
  }

  let startTime = start.empty ? null : startToken?.normalized;
  let endTime = end.empty && !endToken ? null : endToken?.normalized;

  if (startTime && endTime && shouldPromoteAmbiguousStartToPm(startToken, endToken, endTime)) {
    startTime = addHours(startTime, 12);
  }
  if (startTime && endTime && shouldPromoteAmbiguousEndToPm(startTime, endToken, endTime)) {
    endTime = addHours(endTime, 12);
  }

  return { startTime, endTime };
}

export function optionalNumber(body, field, { min = -Infinity, max = Infinity } = {}) {
  if (!hasField(body, field) || body[field] === undefined) return undefined;
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
  if (!hasField(body, field) || body[field] === undefined) return undefined;
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
  if (!hasField(body, field) || body[field] === undefined) return undefined;
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
  if (!hasField(body, field) || body[field] === undefined) return undefined;
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
  const tokens = extractTimeTokens(value);
  if (tokens[0]) return tokens[0].normalized;
  const text = normalizeTimeText(value);
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

function readTimeField(body, field) {
  const present = hasField(body, field) && body[field] !== undefined;
  const raw = present ? body[field] : undefined;
  const empty = present && (raw === null || raw === '');
  let tokens = present && !empty ? extractTimeTokens(raw) : [];
  if (present && !empty && tokens.length < 2) {
    const rangeTokens = extractImpliedMeridiemRangeTokens(raw);
    if (rangeTokens.length > tokens.length) tokens = rangeTokens;
  }
  return {
    present,
    raw,
    empty,
    tokens,
    invalid: present && !empty && tokens.length === 0,
  };
}

function extractTimeTokens(value) {
  const text = normalizeTimeText(value);
  if (!text) return [];

  const tokens = [];
  const colonPattern = /(^|[^\d])(\d{1,2}):([0-5]\d)\s*(am|pm)?(?=$|[^a-z0-9])/gi;
  let colonMatch;
  while ((colonMatch = colonPattern.exec(text)) !== null) {
    const hoursText = colonMatch[2];
    const hours = Number(hoursText);
    const minutes = Number(colonMatch[3]);
    const meridiem = colonMatch[4] ?? null;
    if (isValidTimeParts(hours, minutes, meridiem)) {
      tokens.push({
        index: colonMatch.index + colonMatch[1].length,
        raw: colonMatch[0].slice(colonMatch[1].length),
        hours,
        minutes,
        meridiem,
        hasColon: true,
        hasLeadingZero: hoursText.length > 1 && hoursText.startsWith('0'),
        normalized: formatTimeParts(hours, minutes, meridiem),
      });
    }
  }

  const hourMeridiemPattern = /(^|[^:\d])(\d{1,2})\s*(am|pm)(?=$|[^a-z0-9])/gi;
  let hourMatch;
  while ((hourMatch = hourMeridiemPattern.exec(text)) !== null) {
    const hours = Number(hourMatch[2]);
    const meridiem = hourMatch[3];
    const index = hourMatch.index + hourMatch[1].length;
    if (isTokenOverlapping(tokens, index) || !isValidTimeParts(hours, 0, meridiem)) continue;
    tokens.push({
      index,
      raw: hourMatch[0].slice(hourMatch[1].length),
      hours,
      minutes: 0,
      meridiem,
      hasColon: false,
      hasLeadingZero: hourMatch[2].length > 1 && hourMatch[2].startsWith('0'),
      normalized: formatTimeParts(hours, 0, meridiem),
    });
  }

  return tokens.sort((a, b) => a.index - b.index);
}

function extractImpliedMeridiemRangeTokens(value) {
  const text = normalizeTimeText(value);
  const pattern = /(?:^|[^\d])(?:from\s+)?(\d{1,2})(?::([0-5]\d))?\s*(?:-|to|until)\s*(\d{1,2})(?::([0-5]\d))?\s*(am|pm)(?=$|[^a-z0-9])/i;
  const match = text.match(pattern);
  if (!match) return [];

  const startHours = Number(match[1]);
  const startMinutes = Number(match[2] ?? 0);
  const endHours = Number(match[3]);
  const endMinutes = Number(match[4] ?? 0);
  const endMeridiem = match[5];
  const startMeridiem = inferStartMeridiem(startHours, endHours, endMeridiem);

  if (!isValidTimeParts(startHours, startMinutes, startMeridiem) || !isValidTimeParts(endHours, endMinutes, endMeridiem)) {
    return [];
  }

  const startIndex = match.index + match[0].indexOf(match[1]);
  const endIndex = match.index + match[0].lastIndexOf(match[3]);
  return [
    {
      index: startIndex,
      raw: match[1] + (match[2] ? `:${match[2]}` : ''),
      hours: startHours,
      minutes: startMinutes,
      meridiem: startMeridiem,
      hasColon: Boolean(match[2]),
      hasLeadingZero: match[1].length > 1 && match[1].startsWith('0'),
      normalized: formatTimeParts(startHours, startMinutes, startMeridiem),
    },
    {
      index: endIndex,
      raw: `${match[3]}${match[4] ? `:${match[4]}` : ''}${endMeridiem}`,
      hours: endHours,
      minutes: endMinutes,
      meridiem: endMeridiem,
      hasColon: Boolean(match[4]),
      hasLeadingZero: match[3].length > 1 && match[3].startsWith('0'),
      normalized: formatTimeParts(endHours, endMinutes, endMeridiem),
    },
  ];
}

function inferStartMeridiem(startHours, endHours, endMeridiem) {
  if (endMeridiem !== 'pm') return endMeridiem;
  if (startHours === 12) return 'pm';
  if (startHours > endHours) return 'am';
  return 'pm';
}

function shouldPromoteAmbiguousStartToPm(startToken, endToken, endTime) {
  if (!startToken || startToken.meridiem || !startToken.hasColon || startToken.hasLeadingZero) return false;

  const startHours = Number(startToken.normalized.slice(0, 2));
  if (startHours < 1 || startHours > 11) return false;

  const shiftedStart = timeToMinutes(startToken.normalized) + 12 * 60;
  const endMinutes = timeToMinutes(endTime);
  const endLooksAfternoon = endToken?.meridiem === 'pm' || Number(endTime.slice(0, 2)) >= 13;
  return endLooksAfternoon && shiftedStart < endMinutes;
}

function shouldPromoteAmbiguousEndToPm(startTime, endToken, endTime) {
  if (!endToken || endToken.meridiem || !endToken.hasColon || endToken.hasLeadingZero) return false;

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (startMinutes < 12 * 60 || endMinutes >= startMinutes) return false;

  const shiftedEnd = endMinutes + 12 * 60;
  return shiftedEnd > startMinutes && shiftedEnd < 24 * 60;
}

function normalizeTimeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/(\d{1,2})\.(\d{2})/g, '$1:$2')
    .replace(/\s+/g, ' ');
}

function isValidTimeParts(hours, minutes, meridiem) {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) return false;
  return meridiem ? hours >= 1 && hours <= 12 : hours >= 0 && hours <= 23;
}

function formatTimeParts(hours, minutes, meridiem) {
  let normalizedHours = hours;
  if (meridiem === 'am') {
    normalizedHours = hours === 12 ? 0 : hours;
  } else if (meridiem === 'pm') {
    normalizedHours = hours === 12 ? 12 : hours + 12;
  }
  return `${String(normalizedHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function isTokenOverlapping(tokens, index) {
  return tokens.some((token) => index >= token.index && index < token.index + token.raw.length);
}

function addHours(value, hoursToAdd) {
  const minutes = timeToMinutes(value) + hoursToAdd * 60;
  const hours = Math.floor(minutes / 60) % 24;
  const minutesRemainder = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutesRemainder).padStart(2, '0')}`;
}

function timeFormatError(field) {
  return new HttpError(400, `${field} must be a valid time such as HH:MM, 2:15pm, or 9am.`);
}
