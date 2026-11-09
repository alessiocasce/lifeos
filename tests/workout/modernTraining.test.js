import test from 'node:test';
import assert from 'node:assert/strict';
import { nextWorkoutDraft } from '../../src/utils/workoutPrefill.js';
import { acknowledgeWorkoutCompletion, isWorkoutCompletionAcknowledged } from '../../src/utils/workoutContinuity.js';
import { completedTemplateExercises, workoutWeightLabel, trainingExerciseLabel } from '../../src/utils/workoutCompletion.js';
import { loadFilteredWorkoutPage, weekDates } from '../../src/utils/workoutHistoryFilter.js';
import { searchExercises, resolveExercise } from '../../src/utils/exerciseCatalog.js';

test('a successfully saved warmup prepares working set one, clears outcomes and uses working history', () => {
  const next = nextWorkoutDraft({ exercise: 'Bench', weight: '40', reps: '10', is_warmup: true, rpe: '8', notes: 'warm' },
    [{ set_number: 1, weight: 80, reps: 8, is_warmup: false }], { weight: 40, reps: 10 }, 1);
  assert.equal(next.is_warmup, false);
  assert.equal(next.set_number, 1);
  assert.equal(next.weight, '80');
  assert.equal(next.reps, '8');
  assert.equal(next.rpe, '');
  assert.equal(next.notes, '');
});

test('completion acknowledgement survives reload without hiding other workouts or users', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(isWorkoutCompletionAcknowledged('a', 'one', { storage }), false);
  acknowledgeWorkoutCompletion('a', 'one', { storage });
  assert.equal(isWorkoutCompletionAcknowledged('a', 'one', { storage }), true);
  assert.equal(isWorkoutCompletionAcknowledged('b', 'one', { storage }), false);
  assert.equal(isWorkoutCompletionAcknowledged('a', 'two', { storage }), false);
});

test('template creation contains only performed canonical exercises in first-performance order', () => {
  const result = completedTemplateExercises({ workout_sets: [
    { exercise: 'Late', exercise_id: 'two', performed_at: '2026-11-08T11:00:00Z', weight: 99 },
    { exercise: 'Early', exercise_id: 'one', performed_at: '2026-11-08T10:00:00Z' },
    { exercise: 'Early localized', exercise_id: 'one', performed_at: '2026-11-08T12:00:00Z' },
  ] });
  assert.deepEqual(result, [
    { exercise: 'Early', exercise_id: 'one', exercise_order: 1 },
    { exercise: 'Late', exercise_id: 'two', exercise_order: 2 },
  ]);
});

test('owner-confirmed legacy curl identity resolves to the single EZ-backed Barbell Curl', () => {
  assert.equal(trainingExerciseLabel({ exercise_id: 'a2bc1c95-14c7-558d-a56b-0973cc4793dd' }, 'en'), 'Barbell Curl');
  assert.equal(trainingExerciseLabel({ exercise_id: '860c2371-8592-5ad9-aa43-805984020e52' }, 'en'), 'Barbell Curl');
  assert.equal(workoutWeightLabel({ exercise_id: '860c2371-8592-5ad9-aa43-805984020e52' }), 'Total load (kg)');
  assert.equal(resolveExercise('Barbell Curl').slug, 'ez_bar_curl');
  assert.equal(resolveExercise('EZ-Bar Curl').slug, 'ez_bar_curl');
  assert.equal(searchExercises('Barbell Curl').some(exercise => exercise.slug === 'barbell_curl'), false);
  assert.ok(searchExercises('EZ-Bar Curl').some(exercise => exercise.slug === 'ez_bar_curl'));
});

test('Rome calendar week remains Monday to Sunday across daylight saving', () => {
  assert.deepEqual(weekDates('2026-10-25'), ['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25']);
});

test('filtered history scans beyond initial 25 and retains multiple workouts per date', async () => {
  const requests = [];
  const pages = [
    { rows: Array.from({ length: 25 }, (_, i) => ({ id: String(i), performed_on: '2026-11-08' })), hasMore: true, cursor: { id: '24' } },
    { rows: [{ id: 'older-a', performed_on: '2026-10-01', template_id: 'target' }, { id: 'older-b', performed_on: '2026-10-01', template_id: 'target' }], hasMore: false, cursor: null },
  ];
  const filter = { from: '2026-09-28', to: '2026-10-04', templateId: 'target' };
  const result = await loadFilteredWorkoutPage(async (cursor, size, sent) => { requests.push({ cursor, size, sent }); return pages.shift(); }, filter);
  assert.deepEqual(result.rows.map(row => row.id), ['older-a', 'older-b']);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].cursor, { id: '24' });
  assert.deepEqual(requests[0].sent, filter);
});

test('filtered paging discards stale requests rather than leaking rows into another account or filter', async () => {
  let current = true;
  const result = await loadFilteredWorkoutPage(async () => {
    current = false;
    return { rows: [{ id: 'private-a' }], hasMore: false, cursor: null };
  }, {}, null, () => current);
  assert.equal(result, null);
});

test('filtered paging detects a stalled cursor and surfaces failure', async () => {
  await assert.rejects(() => loadFilteredWorkoutPage(async () => ({ rows: [], hasMore: true, cursor: null }), {}), /did not advance/);
});

test('post-save fallback keeps load/reps but never repeats RPE, notes or warmup state', () => {
  assert.deepEqual(nextWorkoutDraft({ exercise: 'Custom', weight: '82.5', reps: '6', rpe: '9', notes: 'hard', is_warmup: false }, [], { weight: 82.5, reps: 6 }, 4),
    { exercise: 'Custom', weight: '82.5', reps: '6', rpe: '', notes: '', is_warmup: false, set_number: 4 });
});
