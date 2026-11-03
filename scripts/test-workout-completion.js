import assert from 'node:assert/strict';
import { workoutCompletionMetrics } from '../src/utils/workoutCompletion.js';
import { resolveExercise } from '../src/utils/exerciseCatalog.js';

const session = { started_at:'2026-11-03T10:00:00Z', ended_at:'2026-11-03T10:45:00Z', workout_sets:[{
  exercise_id:resolveExercise('Barbell Bench Press').id, weight:30, reps:10,
}] };
assert.deepEqual(workoutCompletionMetrics(session), { volume:300, durationMinutes:45 });
for (const exercise of ['Dumbbell Bench Press','Pull-Up','Pectoral Machine','Unknown custom exercise']) {
  assert.equal(workoutCompletionMetrics({ ...session, workout_sets:[{ exercise, weight:30, reps:10 }] }).volume,null);
}
for (const patch of [{ started_at:null },{ ended_at:null },{ ended_at:'2026-11-05T10:00:00Z' },{ ended_at:'2026-11-02T10:00:00Z' }]) {
  assert.equal(workoutCompletionMetrics({ ...session,...patch }).durationMinutes,null);
}
assert.equal(workoutCompletionMetrics({ ...session,workout_sets:[] }).volume,null);
console.log('Workout completion: volume convention and duration validity checks passed.');
