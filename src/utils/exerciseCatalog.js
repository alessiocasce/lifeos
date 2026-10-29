import catalog from '../data/exerciseCatalog.json' with { type: 'json' };
export const exerciseCatalog = catalog;
export const normalizeExerciseText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const byId = new Map(catalog.map(e => [e.id,e]));
const aliases = new Map();
for (const exercise of catalog) {
  for (const label of [exercise.name_en,exercise.name_it,...exercise.aliases]) {
    const key=normalizeExerciseText(label);
    const matches=aliases.get(key) || new Set(); matches.add(exercise.id); aliases.set(key,matches);
  }
}
export function resolveExercise(value) {
  const matches=aliases.get(normalizeExerciseText(typeof value==='object' ? value?.exercise : value));
  return matches?.size===1 ? byId.get([...matches][0]) : null;
}
export const getCatalogExercise = id => byId.get(id) || null;
export function exerciseIdentityKey(value) {
  if (value?.exercise_id) return `catalog:${value.exercise_id}`;
  const text=typeof value==='object' ? value?.exercise : value;
  const exercise=resolveExercise(text);
  return exercise ? `catalog:${exercise.id}` : `legacy:${normalizeExerciseText(text)}`;
}
export function exerciseLabel(value, language='en') {
  const exercise = value?.exercise_id ? byId.get(value.exercise_id) : resolveExercise(typeof value==='object' ? value?.exercise : value);
  return exercise?.[language==='it' ? 'name_it' : 'name_en'] || (typeof value==='string' ? value : value?.exercise) || '';
}
export function searchExercises(query='', category='', limit=30) {
  const words=normalizeExerciseText(query).split(' ').filter(Boolean);
  return catalog.filter(e => e.active && (!category || e.category===category) && words.every(word => normalizeExerciseText([e.name_en,e.name_it,...e.aliases].join(' ')).includes(word))).slice(0,limit);
}
