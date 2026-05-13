import { HttpError } from './http.js';

export const today = () => new Date().toISOString().slice(0, 10);

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
  const value = String(body[field]).trim();
  if (!isValidDate(value)) throw new HttpError(400, `${field} must be a valid date in YYYY-MM-DD format.`);
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
    throw new HttpError(400, `${field} must use HH:MM time format.`);
  }
  const value = String(body[field]).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new HttpError(400, `${field} must use HH:MM time format.`);
  }
  return value;
}

export function optionalNullableTime(body, field) {
  if (!hasField(body, field)) return undefined;
  if (body[field] === null || body[field] === '') return null;
  return optionalTime(body, field);
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
  const value = Number(body[field]);
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
  return Number(String(value ?? '').trim().replace(',', '.'));
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

function hasField(body, field) {
  return Object.prototype.hasOwnProperty.call(body, field);
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
