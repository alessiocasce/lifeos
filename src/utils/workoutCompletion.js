import { resolveExercise } from './exerciseCatalog.js';

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
