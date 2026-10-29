import { useSyncExternalStore } from 'react';
import italian from './it.json' with { type: 'json' };

let language = 'en';
const listeners = new Set();
const folded = new Map(Object.entries(italian).map(([key,value])=>[key.trim().toLowerCase(),value]));
const english = { 'muscle.chest':'Chest','muscle.back':'Back','muscle.shoulders':'Shoulders','muscle.biceps':'Biceps','muscle.triceps':'Triceps','muscle.quadriceps':'Quadriceps','muscle.hamstrings':'Hamstrings','muscle.glutes':'Glutes','muscle.calves':'Calves','muscle.core':'Core','muscle.full_body':'Full body' };
export const getLanguage = () => language;
export const getLocale = () => language === 'it' ? 'it-IT' : 'en-GB';
export function setLanguage(next) {
  const safe = next === 'it' ? 'it' : 'en';
  if (safe === language) return;
  language = safe;
  if (typeof document !== 'undefined') document.documentElement.lang = safe;
  listeners.forEach(listener => listener());
}
export function useLanguage() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, getLanguage, () => 'en');
}
export function t(key, values = {}) {
  if (typeof key !== 'string') return key;
  const message = language === 'it' ? italian[key] ?? folded.get(key.trim().toLowerCase()) ?? key : english[key] ?? key;
  return message.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values,name) ? String(values[name]) : match);
}
export function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(getLocale(),{timeZone:'Europe/Rome',...options}).format(date) : String(value || '');
}
