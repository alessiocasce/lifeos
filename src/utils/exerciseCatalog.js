import catalog from '../data/exerciseCatalog.json' with { type: 'json' };
import { getLanguage } from '../i18n/index.js';
export const exerciseCatalog = catalog;
export const normalizeExerciseText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const byId = new Map(catalog.map(e => [e.id,e]));
// Retired picker ID is retained in the catalog, but belongs to the confirmed EZ history.
export const canonicalExerciseId = id => id === '860c2371-8592-5ad9-aa43-805984020e52' ? 'a2bc1c95-14c7-558d-a56b-0973cc4793dd' : id;
const confirmedCurlNames = new Set(['barbell curl', 'ez-bar curl', 'ez bar curl', 'curl con bilanciere', 'curl con bilanciere ez']);
const aliases = new Map();
const activeNames = new Map();
for (const exercise of catalog) {
  if (canonicalExerciseId(exercise.id) !== exercise.id) continue;
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
  if (value?.exercise_id) return byId.get(canonicalExerciseId(value.exercise_id)) || null;
  if (value && typeof value==='object' && value.exercise_id===null && !confirmedCurlNames.has(normalizeExerciseText(value.exercise))) return null;
  const key=normalizeExerciseText(typeof value==='object' ? value?.exercise : value);
  const exact=activeNames.get(key);
  if (exact?.size===1) return byId.get([...exact][0]);
  const matches=aliases.get(key);
  return matches?.size===1 ? byId.get([...matches][0]) : null;
}
export const getCatalogExercise = id => byId.get(canonicalExerciseId(id)) || null;
export function exerciseIdentityKey(value) {
  if (value?.exercise_id) return `catalog:${canonicalExerciseId(value.exercise_id)}`;
  const text=typeof value==='object' ? value?.exercise : value;
  if (value && typeof value==='object' && value.exercise_id===null && !confirmedCurlNames.has(normalizeExerciseText(text))) return `legacy:${normalizeExerciseText(text)}`;
  const exercise=resolveExercise(text);
  return exercise ? `catalog:${exercise.id}` : `legacy:${normalizeExerciseText(text)}`;
}
export function exerciseLabel(value, language=getLanguage()) {
  if (value && typeof value==='object' && value.exercise_id===null && !confirmedCurlNames.has(normalizeExerciseText(value.exercise))) return value.exercise || '';
  const exercise = resolveExercise(value);
  return exercise?.[language==='it' ? 'name_it' : 'name_en'] || (typeof value==='string' ? value : value?.exercise) || '';
}
export function searchExercises(query='', category='', limit=30) {
  const words=normalizeExerciseText(query).split(' ').filter(Boolean);
  return catalog.filter(e => e.active && (!category || e.category===category) && words.every(word => normalizeExerciseText([e.name_en,e.name_it,...e.aliases].join(' ')).includes(word))).slice(0,limit);
}
