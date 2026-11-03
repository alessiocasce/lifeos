import { test, expect } from '@playwright/test';
import { localDate } from '../../src/utils/date.js';
import { searchExercise, selectExercise } from './exercisePicker.js';
import { resolveExercise } from '../../src/utils/exerciseCatalog.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(({ today, ids }) => {
    if (sessionStorage.getItem('qa-history-seeded')) return;
    sessionStorage.setItem('qa-history-seeded', 'true');
    const session = (id, date, sets, ended = true) => ({ id, user_id: 'qa-user-a', name: id, performed_on: date,
      started_at: date + 'T12:00:00Z', ended_at: ended ? date + 'T13:00:00Z' : null, updated_at: date + 'T14:00:00Z', workout_sets: sets });
    const day = (offset) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
    const set = (id, exercise, weight, reps, number, warmup = false) => ({ id, exercise, exercise_id:ids[exercise]||null, weight, reps,
      set_number: number, is_warmup: warmup, rpe: 8, notes: 'Controlled', updated_at: day(-1) + 'T14:00:00Z', performed_at: day(-1) + 'T12:30:00Z' });
    localStorage.setItem('qa-workouts', JSON.stringify([
      session('qa-active', today, [], false),
      { ...session('qa-unrelated', day(-1), [set('qa-row', 'Row', 30, 8, 1)]), started_at: day(-1) + 'T16:00:00Z' },
      session('qa-prior', day(-1), [{ ...set('qa-warmup', 'Barbell Curl', 100, 1, 1001, true), rpe: null },
        set('qa-set-1', 'Barbell Curl', 25, 8, 1), set('qa-set-2', 'Barbell Curl', 27.5, 6, 2),
        set('qa-dumbbell', 'Dumbbell Curl', 14, 10, 1)]),
      session('qa-future', day(1), [set('qa-future-set', 'Barbell Curl', 200, 1, 1)]),
    ]));
  }, { today: localDate(),ids:Object.fromEntries(['Barbell Curl','Dumbbell Curl'].map(name=>[name,resolveExercise(name).id])) });
});

test('exercise suggestions support keyboard selection, dismissal and durable exercise choice', async ({ page }, info) => {
  await page.goto('/workout');
  const exercise = page.getByRole('button', { name: 'Exercise', exact: true });
  await searchExercise(page,'Curl');
  await page.getByRole('dialog').getByRole('textbox',{name:'Exercise',exact:true}).press('ArrowDown');
  const suggestions = page.getByRole('group', { name: 'Exercise suggestions' });
  await expect(suggestions.getByRole('button', { name: 'Barbell Curl', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(suggestions.getByRole('button', { name: 'Dumbbell Curl', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(exercise).toContainText('Dumbbell Curl');
  await expect(exercise).toBeFocused();
  await expect(suggestions).toHaveCount(0);
  await page.reload();
  await expect(exercise).toContainText('Dumbbell Curl');
  await searchExercise(page,'Curl');
  await page.getByRole('dialog').getByRole('textbox',{name:'Exercise',exact:true}).press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(exercise).toBeFocused();
  await expect(exercise).toContainText('Dumbbell Curl');
  await expect(suggestions).toHaveCount(0);
  await searchExercise(page,'C');
  await page.getByRole('dialog').getByRole('textbox',{name:'Exercise',exact:true}).fill('Curl');
  const button = suggestions.getByRole('button', { name: 'Barbell Curl', exact: true });
  expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: info.outputPath('exercise-suggestions.png'), fullPage: true });
  await button.click();
  await expect(exercise).toContainText('Barbell Curl');
});

test('full last time includes warmups, RPE and notes from the latest matching prior workout', async ({ page }, info) => {
  await page.goto('/workout');
  const logger = page.getByRole('region', { name: 'Workout set logger' });
  await selectExercise(page,'Barbell Curl');
  await expect(logger).toContainText('27.5 kg × 6');
  await expect(logger).toContainText('25 kg × 8');
  await expect(logger).toContainText('100 kg × 1');
  await expect(logger.getByRole('region', { name: 'Last time' })).toContainText('RPE 8');
  await expect(logger.getByRole('region', { name: 'Last time' })).toContainText('Controlled');
  await expect(logger).not.toContainText('Estimated 1RM');
  await expect(logger).not.toContainText('200 kg');
  await page.getByRole('button', { name: 'Command', exact: true }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exercise', exact: true })).toContainText('Barbell Curl');
  await expect(logger).toContainText('27.5 kg × 6');
  await page.screenshot({ path: info.outputPath('live-last-time.png'), fullPage: true });
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /qa-prior/ }).click();
  await expect(page.getByRole('button', { name: 'Edit set', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Workout history' })).toContainText('100 kg × 1');
  await expect(page.getByRole('button', { name: 'Edit workout', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete workout', exact: true })).toBeVisible();
  await expect(page.getByText('Session actions', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Barbell Curl', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete set qa-set-1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reopen', exact: true })).toHaveCount(0);
});

test('completed workout can be corrected in History without changing its completion timestamp', async ({ page }, info) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /qa-prior/ }).click();
  await page.screenshot({ path: info.outputPath('history-detail-readonly.png') });
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts')).find(row => row.id === 'qa-prior').ended_at);
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
  await page.screenshot({ path: info.outputPath('history-detail-edit-mode.png') });
  await page.getByRole('button', { name: 'Edit workout details', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Corrected chest day');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Corrected chest day' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Barbell Curl', exact: true }).click();
  await page.screenshot({ path: info.outputPath('history-exercise-editor.png') });
  await page.getByRole('button', { name: 'Edit set qa-set-1', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Historical set editor' });
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('9');
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('history-set-editor.png') });
  await editor.getByRole('button', { name: 'Save set', exact: true }).click();
  const workout = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts')).find(row => row.id === 'qa-prior'));
  expect(workout.ended_at).toBe(before);
  expect(workout.name).toBe('Corrected chest day');
  expect(workout.workout_sets.find(set => set.id === 'qa-set-1').reps).toBe(9);
  await page.getByRole('button', { name: 'Add set', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Weight', exact: true }).fill('30');
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('7');
  await editor.getByRole('button', { name: 'Save set', exact: true }).click();
  const afterAdd = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts')).find(row => row.id === 'qa-prior'));
  expect(afterAdd.ended_at).toBe(before);
  expect(afterAdd.workout_sets).toHaveLength(5);
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await selectExercise(page, 'Barbell Curl');
  await expect(page.getByRole('region', { name: 'Last time' })).toContainText('25 kg × 9');
  await expect(page.getByRole('region', { name: 'Last time' })).toContainText('30 kg × 7');
});

test('session deletion requires confirmation, retains failed session and clears only its draft on retry', async ({ page }) => {
  await page.goto('/workout');
  await selectExercise(page,'Squat');
  await page.getByRole('button', { name: 'Workout options', exact: true }).click();
  const remove = page.getByRole('button', { name: 'Delete workout', exact: true });
  expect((await remove.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await remove.click();
  const confirm = page.getByRole('button', { name: 'Confirm Delete Session', exact: true });
  await expect(confirm).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts')).length)).toBe(4);
  await page.evaluate(() => {
    localStorage.setItem('qa-session-delete-fail', 'true');
    localStorage.setItem('qa-session-delete-delay', '500');
  });
  await confirm.click();
  await expect(confirm).toBeDisabled();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Workout session was not deleted.');
  await expect(page.locator('button[aria-label="Exercise"]')).toContainText('Squat');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts')).length)).toBe(4);
  await page.evaluate(() => localStorage.removeItem('qa-session-delete-fail'));
  await confirm.click();
  await expect(confirm).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts')).map((row) => row.id)))
    .toEqual(['qa-unrelated', 'qa-prior', 'qa-future']);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes(':draft:qa-active')))).toEqual([]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start Empty Workout', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exercise', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('button', { name: /qa-prior/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /qa-active/ })).toHaveCount(0);
});

test('History is read-only and returning Live preserves session and complete draft on mobile', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/workout');
  await selectExercise(page,'Barbell Curl');
  await page.getByRole('textbox', { name: 'Weight (kg)', exact: true }).fill('80');
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('8');
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('button', { name: 'RPE 9', exact: true }).click();
  await page.getByRole('textbox', { name: 'Set notes', exact: true }).fill('Keep this draft');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  const workspace = await page.evaluate(() => localStorage.getItem('lifeos:training:v1:qa-user-a:workspace'));
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.screenshot({ path: info.outputPath('history-list.png'), fullPage: true });
  await page.getByRole('button', { name: /qa-prior/ }).click();
  await expect(page.getByRole('button', { name: 'Edit set', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete set', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('history-detail.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('lifeos:training:v1:qa-user-a:workspace'))).toBe(workspace);
  await page.getByRole('button', { name: 'Back to History', exact: true }).click();
  await page.getByRole('button', { name: /qa-future/ }).click();
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exercise', exact: true })).toContainText('Barbell Curl');
  await expect(page.getByRole('textbox', { name: 'Weight (kg)', exact: true })).toHaveValue('80');
  await expect(page.getByRole('textbox', { name: 'Reps', exact: true })).toHaveValue('8');
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await expect(page.getByRole('button', { name: 'RPE 9', exact: true })).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('textbox', { name: 'Set notes', exact: true })).toHaveValue('Keep this draft');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Exercise', exact: true })).toContainText('Barbell Curl');
  expect(errors).toEqual([]);
});

test('History list position is independent and every selected workout opens at the top', async ({ page }) => {
  await page.goto('/workout');
  await page.evaluate(() => {
    const sessions = Array.from({ length: 24 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 8, 30 - index)).toISOString().slice(0, 10);
      return {
        id: `history-${index + 1}`,
        user_id: 'qa-user-a',
        name: `History ${String(index + 1).padStart(2, '0')}`,
        performed_on: date,
        started_at: `${date}T10:00:00Z`,
        ended_at: `${date}T11:00:00Z`,
        workout_sets: Array.from({ length: index === 23 ? 20 : 2 }, (_, setIndex) => ({
          id: `history-${index + 1}-set-${setIndex + 1}`,
          workout_id: `history-${index + 1}`,
          exercise: `Exercise ${setIndex < 10 ? 'A' : 'B'}`,
          set_number: setIndex + 1,
          is_warmup: false,
          weight: 20,
          reps: 8,
          performed_at: `${date}T10:30:00Z`,
        })),
      };
    });
    localStorage.setItem('qa-workouts', JSON.stringify(sessions));
  });
  await page.reload();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const historyY = await page.evaluate(() => window.scrollY);
  expect(historyY).toBeGreaterThan(500);
  await page.getByRole('button', { name: /History 24/ }).click();
  await expect(page.getByRole('heading', { name: 'History 24' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Exercise B', exact: true }).click();
  await page.getByRole('button', { name: 'Edit set history-24-set-20', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Historical set editor' });
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('9');
  await editor.getByRole('button', { name: 'Save set', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Back to History', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(historyY);
  await page.getByRole('button', { name: /History 24/ }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: 'Back to History', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(historyY);
  await page.getByRole('button', { name: /History 23/ }).click();
  await expect(page.getByRole('heading', { name: 'History 23' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

const savedHistory = page => page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts')).find(row => row.id === 'qa-prior'));
async function editHistory(page) {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /qa-prior/ }).click();
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
}
async function editHistoricalSet(page) {
  await editHistory(page);
  await page.getByRole('button', { name: 'Edit Barbell Curl', exact: true }).click();
  await page.getByRole('button', { name: 'Edit set qa-set-1', exact: true }).click();
  return page.getByRole('form', { name: 'Historical set editor' });
}

test('date and fractional RPE corrections preserve identity, timestamps, completion and Live draft', async ({ page }) => {
  await page.goto('/workout');
  await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('qa-workouts'));
    const workout = rows.find(row => row.id === 'qa-prior');
    workout.workout_sets.find(set => set.id === 'qa-set-1').rpe = 8.5;
    workout.template_snapshot = [{ exercise: 'Never performed template exercise' }];
    localStorage.setItem('qa-workouts', JSON.stringify(rows));
  });
  const editor = await editHistoricalSet(page);
  const before = await savedHistory(page);
  await expect(page.getByText('Never performed template exercise')).toHaveCount(0);
  await expect(editor).toContainText('Previous RPE: 8.5. Kept unless changed.');
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('11');
  await editor.getByRole('button', { name: 'Save set', exact: true }).click();
  await page.getByRole('button', { name: 'Edit workout details', exact: true }).click();
  await page.getByLabel('Date', { exact: true }).fill('2026-09-15');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const after = await savedHistory(page);
  expect(after.performed_on).toBe('2026-09-15');
  expect(after.ended_at).toBe(before.ended_at);
  expect(after.started_at).toBe(before.started_at);
  expect(after.template_snapshot).toEqual(before.template_snapshot);
  expect(after.workout_sets[1]).toMatchObject({ ...before.workout_sets[1], reps: 11, updated_at: expect.any(String) });
  expect(after.workout_sets[1].rpe).toBe(8.5);
});

test('failed set mutation retains draft; duplicate submissions cannot save twice', async ({ page }) => {
  const editor = await editHistoricalSet(page);
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('12');
  await page.evaluate(() => {
    localStorage.setItem('qa-set-update-fail', 'true');
    localStorage.setItem('qa-set-update-delay', '300');
  });
  await editor.evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  await expect(page.getByRole('alert')).toContainText('not saved');
  await expect(editor.getByRole('textbox', { name: 'Reps', exact: true })).toHaveValue('12');
  expect((await savedHistory(page)).workout_sets[1].reps).toBe(8);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workout-mutations')).filter(row => row.operation === 'set-update').length)).toBe(1);
  await page.evaluate(() => localStorage.removeItem('qa-set-update-fail'));
  await editor.getByRole('button', { name: 'Save set', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect((await savedHistory(page)).workout_sets[1].reps).toBe(12);
});

test('stale editor rejects a concurrent set change rather than overwriting it', async ({ page }) => {
  const editor = await editHistoricalSet(page);
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('12');
  await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('qa-workouts'));
    Object.assign(rows.find(row => row.id === 'qa-prior').workout_sets[1], { reps: 15, updated_at: '2026-11-03T20:00:00Z' });
    localStorage.setItem('qa-workouts', JSON.stringify(rows));
  });
  await editor.getByRole('button', { name: 'Save set', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  expect((await savedHistory(page)).workout_sets[1].reps).toBe(15);
  await expect(editor.getByRole('textbox', { name: 'Reps', exact: true })).toHaveValue('12');
});

test('set deletion failure is honest and exercise deletion is one atomic mutation', async ({ page }) => {
  await editHistory(page);
  const before = await savedHistory(page);
  await page.getByRole('button', { name: 'Edit Barbell Curl', exact: true }).click();
  await page.evaluate(() => localStorage.setItem('qa-set-delete-fail', 'true'));
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete set qa-set-1', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not saved');
  expect((await savedHistory(page)).workout_sets).toHaveLength(4);
  await page.evaluate(() => localStorage.removeItem('qa-set-delete-fail'));
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete set qa-set-1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete set qa-set-1', exact: true })).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('qa-exercise-delete-fail', 'true'));
  page.once('dialog', dialog => { expect(dialog.message()).toContain('2'); return dialog.accept(); });
  await page.getByRole('button', { name: 'Delete exercise from workout', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not saved');
  expect((await savedHistory(page)).workout_sets).toHaveLength(3);
  await page.evaluate(() => localStorage.removeItem('qa-exercise-delete-fail'));
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete exercise from workout', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Barbell Curl', exact: true })).toHaveCount(0);
  const after = await savedHistory(page);
  expect(after.workout_sets).toEqual([before.workout_sets[3]]);
  expect(after.ended_at).toBe(before.ended_at);
});

test('catalog addition is tentative, confirms dirty discard once, and saves only the historical set', async ({ page }, info) => {
  const editor = await editHistoricalSet(page);
  const before = await savedHistory(page);
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('12');
  let confirms = 0;
  page.on('dialog', async dialog => { confirms++; await dialog.accept(); });
  await selectExercise(page, 'Dumbbell Bench Press', { label: 'Add exercise' });
  expect(confirms).toBe(1);
  expect((await savedHistory(page)).workout_sets).toHaveLength(4);
  await expect(editor.getByRole('heading', { name: 'Dumbbell Bench Press' })).toBeVisible();
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(confirms).toBe(1);
  expect((await savedHistory(page)).workout_sets).toHaveLength(4);
  await selectExercise(page, 'Dumbbell Bench Press', { label: 'Add exercise' });
  await editor.getByRole('textbox', { name: 'Weight', exact: true }).fill('30');
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('10');
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('history-add-exercise.png') });
  await editor.getByRole('button', { name: 'Save set', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const after = await savedHistory(page);
  const added = after.workout_sets.find(set => set.exercise === 'Dumbbell Bench Press');
  expect(added).toMatchObject({ workout_id: before.id, exercise_id: resolveExercise('Dumbbell Bench Press').id, set_number: 1,
    performed_at: before.performed_on + 'T12:00:00.000Z', reps: 10, rpe: null });
  expect(after.ended_at).toBe(before.ended_at);
  expect(after.template_snapshot).toEqual(before.template_snapshot);
});

test('Community and Live navigation honor dirty cancellation; unchanged forms do not prompt', async ({ page }) => {
  const editor = await editHistoricalSet(page);
  let confirms = 0;
  const dismiss = async dialog => { confirms++; await dialog.dismiss(); };
  page.on('dialog', dismiss);
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('12');
  await page.getByRole('button', { name: 'View in Community', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Historical set editor' })).toBeVisible();
  expect(page.url()).not.toContain('/community');
  expect(confirms).toBe(1);
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(editor).toBeVisible();
  expect(confirms).toBe(2);
  page.off('dialog', dismiss);
  page.once('dialog', async dialog => { confirms++; await dialog.accept(); });
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Edit set qa-set-1', exact: true }).click();
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(confirms).toBe(3);
  await page.getByRole('button', { name: 'View in Community', exact: true }).click();
  await expect(page).toHaveURL(/community/);
});

test('History loads beyond 25 incrementally, retries errors, deduplicates and preserves older detail access', async ({ page }) => {
  await page.goto('/workout');
  await page.evaluate(() => {
    const rows = Array.from({ length: 55 }, (_, i) => ({ id: 'past-' + String(i).padStart(3,'0'), user_id: 'qa-user-a',
      name: 'Past workout ' + i, performed_on: new Date(Date.UTC(2026, 8, 30-i)).toISOString().slice(0,10),
      started_at: null, ended_at: '2026-10-01T12:00:00Z', workout_sets: [] }));
    localStorage.setItem('qa-workouts', JSON.stringify(rows));
  });
  await page.reload();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('button', { name: /Past workout 54$/ })).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('qa-history-page-fail', 'true'));
  await page.getByRole('button', { name: 'Load older workouts', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Older workouts');
  await page.evaluate(() => localStorage.removeItem('qa-history-page-fail'));
  await page.getByRole('button', { name: 'Load older workouts', exact: true }).click();
  await page.getByRole('button', { name: 'Load older workouts', exact: true }).click();
  await expect(page.getByRole('button', { name: /Past workout 54/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Load older workouts', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Past workout 54/ }).click();
  await expect(page.getByRole('heading', { name: 'Past workout 54' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Done editing', exact: true })).toBeVisible();
});

test('historical warmup addition uses separate numbering and custom additions stay workout scoped', async ({ page }) => {
  await editHistory(page);
  const before = await savedHistory(page);
  await page.getByRole('button', { name: 'Edit Barbell Curl', exact: true }).click();
  await page.getByRole('button', { name: 'Add set', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Historical set editor' });
  await editor.getByRole('textbox', { name: 'Weight', exact: true }).fill('10');
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('10');
  await editor.getByRole('button', { name: /Warmup/ }).click();
  await editor.getByRole('button', { name: 'Save set', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const warmup = (await savedHistory(page)).workout_sets.at(-1);
  expect(warmup).toMatchObject({ set_number: 1002, is_warmup: true, workout_id: before.id });
  await page.getByRole('button', { name: 'Add set', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Weight', exact: true }).fill('25');
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('7');
  await editor.getByRole('button', { name: 'Save set', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect((await savedHistory(page)).workout_sets.at(-1)).toMatchObject({ set_number: 3, is_warmup: false });
  await selectExercise(page, 'My custom historical lift', { label: 'Add exercise' });
  await editor.getByRole('textbox', { name: 'Weight', exact: true }).fill('15');
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('5');
  await editor.getByRole('button', { name: 'Save set', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const after = await savedHistory(page);
  expect(after.workout_sets.at(-1)).toMatchObject({ exercise: 'My custom historical lift', exercise_id: null, set_number: 1 });
  expect(after.ended_at).toBe(before.ended_at);
  expect(after.template_snapshot).toEqual(before.template_snapshot);
});

test('History workout deletion retains failures and returns to the list only after success', async ({ page }) => {
  await editHistory(page);
  await page.evaluate(() => localStorage.setItem('qa-session-delete-fail', 'true'));
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete workout', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not deleted');
  await expect(page.getByRole('heading', { name: 'qa-prior' })).toBeVisible();
  expect(await savedHistory(page)).toBeTruthy();
  await page.evaluate(() => localStorage.removeItem('qa-session-delete-fail'));
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete workout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recent workouts' })).toBeVisible();
  expect(await savedHistory(page)).toBeUndefined();
});

test('an active workout older than the first page still restores its session and unsaved draft', async ({ page }) => {
  await page.goto('/workout');
  await selectExercise(page, 'Dumbbell Bench Press');
  await page.getByRole('textbox', { name: 'Weight (kg)', exact: true }).fill('33');
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('9');
  await page.evaluate(() => {
    const active = JSON.parse(localStorage.getItem('qa-workouts')).find(row => row.id === 'qa-active');
    active.performed_on = '2026-01-01'; active.started_at = '2026-01-01T12:00:00Z';
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: 'newer-' + i, user_id: 'qa-user-a',
      name: 'Newer ' + i, performed_on: '2026-10-01', started_at: null, ended_at: '2026-10-01T13:00:00Z', workout_sets: [] }));
    localStorage.setItem('qa-workouts', JSON.stringify([...rows, active]));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'qa-active', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exercise', exact: true })).toContainText('Dumbbell Bench Press');
  await expect(page.getByRole('textbox', { name: 'Weight (kg)', exact: true })).toHaveValue('33');
  await expect(page.getByRole('textbox', { name: 'Reps', exact: true })).toHaveValue('9');
});

test('resume revalidation retains a dated-out History detail and its dirty form', async ({ page }) => {
  await editHistory(page);
  await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('qa-workouts'));
    for (let i = 0; i < 30; i++) rows.push({ id: 'older-' + i, user_id: 'qa-user-a', name: 'Older ' + i,
      performed_on: '2020-01-01', started_at: null, ended_at: '2020-01-01T12:00:00Z', workout_sets: [] });
    localStorage.setItem('qa-workouts', JSON.stringify(rows));
  });
  await page.getByRole('button', { name: 'Edit workout details', exact: true }).click();
  await page.getByLabel('Date', { exact: true }).fill('1999-01-01');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Barbell Curl', exact: true }).click();
  await page.getByRole('button', { name: 'Edit set qa-set-1', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Historical set editor' });
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('14');
  const loads = await page.evaluate(() => Number(localStorage.getItem('qa-workout-loads')));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => page.evaluate(() => Number(localStorage.getItem('qa-workout-loads')))).toBeGreaterThan(loads);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByRole('heading', { name: 'qa-prior', exact: true })).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Reps', exact: true })).toHaveValue('14');
  page.once('dialog', dialog => dialog.accept());
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
});
