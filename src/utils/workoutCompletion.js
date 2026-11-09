import { resolveExercise } from './exerciseCatalog.js';
import { exerciseIdentityKey, exerciseLabel } from './exerciseCatalog.js';
import { getLanguage } from '../i18n/index.js';

export function workoutWeightLabel(value) {
  const exercise = resolveExercise(value);
  if (exercise?.load_type === 'per_implement') return exercise.equipment === 'dumbbell' ? 'Weight per dumbbell (kg)' : 'Weight per implement (kg)';
  if (exercise?.load_type === 'machine_display') return 'Machine load (kg)';
  if (exercise?.load_type === 'assistance') return 'Assistance (kg)';
  if (exercise?.load_type === 'bodyweight') return 'Additional load (kg)';
  if (exercise?.load_type === 'none') return 'Weight optional';
  if (exercise?.load_type === 'total_external') return 'Total load (kg)';
  return 'Weight (kg)';
}

// Keep historical/custom identity behavior centralized across Training surfaces.
export function trainingExerciseLabel(value, language = getLanguage()) {
  return exerciseLabel(value, language);
}

export function completedTemplateExercises(session) {
  const seen = new Set();
  return (session.workout_sets || []).slice().sort((a, b) =>
    String(a.performed_at || '').localeCompare(String(b.performed_at || ''))).flatMap(set => {
    const key = exerciseIdentityKey(set);
    if (!set.exercise?.trim() || seen.has(key)) return [];
    seen.add(key);
    return [{ exercise: set.exercise, exercise_id: set.exercise_id || null, exercise_order: seen.size }];
  });
}

export function workoutCompletionMetrics(session) {
  const sets = session.workout_sets || [];
  // Only total external loads can be summed without inventing bodyweight,
  // doubling per-implement loads, or interpreting machine-stack resistance.
  const completeLoad = sets.length > 0 && sets.every(set => {
    const exercise = resolveExercise(set);
    return exercise?.load_type === 'total_external' && !exercise.is_unilateral &&
      set.weight != null && set.weight !== '' && Number.isFinite(Number(set.weight)) && Number(set.weight) >= 0 &&
      Number.isInteger(Number(set.reps)) && Number(set.reps) > 0;
  });
  const elapsed = Date.parse(session.ended_at) - Date.parse(session.started_at);
  return {
    volume: completeLoad ? sets.reduce((sum, set) => sum + Number(set.weight) * Number(set.reps), 0) : null,
    durationMinutes: elapsed >= 60000 && elapsed <= 12 * 60 * 60000 ? Math.floor(elapsed / 60000) : null,
  };
}
