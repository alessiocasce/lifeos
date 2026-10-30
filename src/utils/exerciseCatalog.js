import catalog from '../data/exerciseCatalog.json' with { type: 'json' };
import { getLanguage } from '../i18n/index.js';
export const exerciseCatalog = catalog;
export const normalizeExerciseText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const byId = new Map(catalog.map(e => [e.id,e]));
const aliases = new Map();
const activeNames = new Map();
for (const exercise of catalog) {
  if (exercise.active) for (const label of [exercise.name_en,exercise.name_it]) {
    const key=normalizeExerciseText(label);
    const matches=activeNames.get(key) || new Set(); matches.add(exercise.id); activeNames.set(key,matches);
  }
  for (const label of [exercise.name_en,exercise.name_it,...exercise.aliases]) {
    const key=normalizeExerciseText(label);
    const matches=aliases.get(key) || new Set(); matches.add(exercise.id); aliases.set(key,matches);
  }
}
export function resolveExercise(value) {
  if (value?.exercise_id) return byId.get(value.exercise_id) || null;
  if (value && typeof value==='object' && value.exercise_id===null) return null;
  const key=normalizeExerciseText(typeof value==='object' ? value?.exercise : value);
  const exact=activeNames.get(key);
  if (exact?.size===1) return byId.get([...exact][0]);
  const matches=aliases.get(key);
  return matches?.size===1 ? byId.get([...matches][0]) : null;
}
export const getCatalogExercise = id => byId.get(id) || null;
export function exerciseIdentityKey(value) {
  if (value?.exercise_id) return `catalog:${value.exercise_id}`;
  const text=typeof value==='object' ? value?.exercise : value;
  if (value && typeof value==='object' && value.exercise_id===null) return `legacy:${normalizeExerciseText(text)}`;
  const exercise=resolveExercise(text);
  return exercise ? `catalog:${exercise.id}` : `legacy:${normalizeExerciseText(text)}`;
}
export function exerciseLabel(value, language=getLanguage()) {
  if (value && typeof value==='object' && value.exercise_id===null) return value.exercise || '';
  const exercise = value?.exercise_id ? byId.get(value.exercise_id) : resolveExercise(typeof value==='object' ? value?.exercise : value);
  return exercise?.[language==='it' ? 'name_it' : 'name_en'] || (typeof value==='string' ? value : value?.exercise) || '';
}
export function searchExercises(query='', category='', limit=30) {
  const words=normalizeExerciseText(query).split(' ').filter(Boolean);
  return catalog.filter(e => e.active && (!category || e.category===category) && words.every(word => normalizeExerciseText([e.name_en,e.name_it,...e.aliases].join(' ')).includes(word))).slice(0,limit);
}
