import { HttpError } from './http.js';

export const today = () => new Date().toISOString().slice(0, 10);

export function compactPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

export function optionalText(value) {
  if (value === undefined) return undefined;
  const text = String(value ?? '').trim();
  return text || null;
}

export function requiredText(body, field) {
  const text = String(body[field] ?? '').trim();
  if (!text) throw new HttpError(400, `${field} is required.`);
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
  if (body[field] === undefined || body[field] === null || body[field] === '') return undefined;
  const value = String(body[field]).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new HttpError(400, `${field} must use HH:MM time format.`);
  }
  return value;
}

export function optionalNumber(body, field, { min = -Infinity, max = Infinity } = {}) {
  if (body[field] === undefined || body[field] === null || body[field] === '') return undefined;
  const value = parseDecimal(body[field]);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(400, `${field} must be ${formatRange('a number', min, max)}.`);
  }
  return value;
}

export function requiredPositiveNumber(body, field) {
  const value = parseDecimal(body[field]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new HttpError(400, `${field} must be greater than 0.`);
  }
  return value;
}

export function optionalInteger(body, field, { min = -Infinity, max = Infinity } = {}) {
  if (body[field] === undefined || body[field] === null || body[field] === '') return undefined;
  const value = Number(body[field]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, `${field} must be ${formatRange('an integer', min, max)}.`);
  }
  return value;
}

export function parseDecimal(value) {
  if (typeof value === 'number') return value;
  return Number(String(value ?? '').trim().replace(',', '.'));
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatRange(label, min, max) {
  if (Number.isFinite(min) && Number.isFinite(max)) return `${label} between ${min} and ${max}`;
  if (Number.isFinite(min)) return `${label} greater than or equal to ${min}`;
  if (Number.isFinite(max)) return `${label} less than or equal to ${max}`;
  return label;
}
