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
      started_at: date + 'T12:00:00Z', ended_at: ended ? date + 'T13:00:00Z' : null, workout_sets: sets });
    const day = (offset) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
    const set = (id, exercise, weight, reps, number, warmup = false) => ({ id, exercise, exercise_id:ids[exercise]||null, weight, reps,
      set_number: number, is_warmup: warmup, rpe: 8, notes: 'Controlled', performed_at: day(-1) + 'T12:30:00Z' });
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
  await page.getByRole('button', { name: 'Back to History', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(historyY);
  await page.getByRole('button', { name: /History 23/ }).click();
  await expect(page.getByRole('heading', { name: 'History 23' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
