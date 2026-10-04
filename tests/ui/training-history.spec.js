import { test, expect } from '@playwright/test';
import { localDate } from '../../src/utils/date.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(({ today }) => {
    if (sessionStorage.getItem('qa-history-seeded')) return;
    sessionStorage.setItem('qa-history-seeded', 'true');
    const session = (id, date, sets, ended = true) => ({ id, user_id: 'qa-user-a', name: id, performed_on: date,
      started_at: date + 'T12:00:00Z', ended_at: ended ? date + 'T13:00:00Z' : null, workout_sets: sets });
    const day = (offset) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
    const set = (id, exercise, weight, reps, number, warmup = false) => ({ id, exercise, weight, reps,
      set_number: number, is_warmup: warmup, rpe: 8, notes: 'Controlled', performed_at: day(-1) + 'T12:30:00Z' });
    localStorage.setItem('qa-workouts', JSON.stringify([
      session('qa-active', today, [], false),
      { ...session('qa-unrelated', day(-1), [set('qa-row', 'Row', 30, 8, 1)]), started_at: day(-1) + 'T16:00:00Z' },
      session('qa-prior', day(-1), [{ ...set('qa-warmup', 'Barbell Curl', 100, 1, 1001, true), rpe: null },
        set('qa-set-1', 'Barbell Curl', 25, 8, 1), set('qa-set-2', 'Barbell Curl', 27.5, 6, 2),
        set('qa-dumbbell', 'Dumbbell Curl', 14, 10, 1)]),
      session('qa-future', day(1), [set('qa-future-set', 'Barbell Curl', 200, 1, 1)]),
    ]));
  }, { today: localDate() });
});

test('exercise suggestions support keyboard selection, dismissal and durable exercise choice', async ({ page }, info) => {
  await page.goto('/workout');
  const exercise = page.getByRole('textbox', { name: 'Exercise', exact: true });
  await exercise.fill('Curl');
  await exercise.press('ArrowDown');
  const suggestions = page.getByRole('group', { name: 'Exercise suggestions' });
  await expect(suggestions.getByRole('button', { name: 'Barbell Curl', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(suggestions.getByRole('button', { name: 'Dumbbell Curl', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(exercise).toHaveValue('Dumbbell Curl');
  await expect(exercise).toBeFocused();
  await expect(suggestions).toHaveCount(0);
  await page.reload();
  await expect(exercise).toHaveValue('Dumbbell Curl');
  await exercise.fill('Curl');
  await exercise.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(exercise).toBeFocused();
  await expect(exercise).toHaveValue('Curl');
  await expect(suggestions).toHaveCount(0);
  await exercise.fill('C');
  await exercise.fill('Curl');
  const button = suggestions.getByRole('button', { name: 'Barbell Curl', exact: true });
  expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: info.outputPath('exercise-suggestions.png'), fullPage: true });
  await button.click();
  await expect(exercise).toHaveValue('Barbell Curl');
});

test('full last time includes warmups, RPE and notes from the latest matching prior workout', async ({ page }, info) => {
  await page.goto('/workout');
  const logger = page.getByRole('region', { name: 'Workout set logger' });
  await page.getByRole('textbox', { name: 'Exercise', exact: true }).fill('Barbell Curl');
  await expect(logger).toContainText('27.5 kg × 6');
  await expect(logger).toContainText('25 kg × 8');
  await expect(logger).toContainText('100 kg × 1');
  await expect(logger.getByRole('region', { name: 'Last time' })).toContainText('RPE 8');
  await expect(logger.getByRole('region', { name: 'Last time' })).toContainText('Controlled');
  await expect(logger).not.toContainText('Estimated 1RM');
  await expect(logger).not.toContainText('200 kg');
  await page.getByRole('button', { name: 'Command', exact: true }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Exercise', exact: true })).toHaveValue('Barbell Curl');
  await expect(logger).toContainText('27.5 kg × 6');
  await page.screenshot({ path: info.outputPath('live-last-time.png'), fullPage: true });
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /qa-prior/ }).click();
  await expect(page.getByRole('button', { name: 'Edit set', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Workout history' })).toContainText('100 kg × 1');
  await page.getByText('Session actions', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit / reopen workout', exact: true }).click();
  await expect(page.getByText('This workout is ended. Reopen it to add more sets.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reopen', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete set', exact: true })).toHaveCount(4);
});

test('editing warmup classification preserves load, notes and separate set numbering', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /qa-prior/ }).click();
  await page.getByText('Session actions', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit / reopen workout', exact: true }).click();
  await page.getByRole('button', { name: 'Reopen', exact: true }).click();
  await page.getByRole('button', { name: 'Edit set', exact: true }).first().click();
  const editor = page.getByRole('group', { name: 'Edit workout set' });
  const warmup = editor.getByRole('button', { name: /Warmup/ });
  await expect(warmup).toHaveAttribute('aria-pressed', 'true');
  await warmup.click();
  await expect(warmup).toHaveAttribute('aria-pressed', 'false');
  await editor.getByRole('button', { name: 'Save edit', exact: true }).click();
  const row = () => page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))
    .find((session) => session.id === 'qa-prior').workout_sets.find((set) => set.id === 'qa-warmup'));
  expect(await row()).toMatchObject({ is_warmup: false, set_number: 3, weight: 100, reps: 1, rpe: null, notes: 'Controlled' });
  await page.reload();
  await page.getByRole('button', { name: 'Edit set', exact: true }).last().click();
  await expect(editor.getByRole('textbox', { name: 'Weight kg', exact: true })).toHaveValue('100');
  await expect(warmup).toHaveAttribute('aria-pressed', 'false');
  await warmup.click();
  await editor.getByRole('button', { name: 'Save edit', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(await row()).toMatchObject({ is_warmup: true, set_number: 1001, weight: 100, reps: 1 });
});

test('session deletion requires confirmation, retains failed session and clears only its draft on retry', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('textbox', { name: 'Exercise', exact: true }).fill('Squat');
  await page.getByRole('button', { name: 'Session options', exact: true }).click();
  await page.getByRole('button', { name: 'Danger', exact: true }).click();
  const remove = page.getByRole('button', { name: 'Delete Session', exact: true });
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
  await expect(page.getByText('Workout session was not deleted.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Exercise', exact: true })).toHaveValue('Squat');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts')).length)).toBe(4);
  await page.evaluate(() => localStorage.removeItem('qa-session-delete-fail'));
  await confirm.click();
  await expect(confirm).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts')).map((row) => row.id)))
    .toEqual(['qa-unrelated', 'qa-prior', 'qa-future']);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes(':draft:qa-active')))).toEqual([]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start Empty Workout', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Exercise', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('button', { name: /qa-prior/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /qa-active/ })).toHaveCount(0);
});

test('History is read-only and returning Live preserves session and complete draft on mobile', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/workout');
  await page.getByRole('textbox', { name: 'Exercise', exact: true }).fill('Barbell Curl');
  await page.getByRole('textbox', { name: 'Weight kg', exact: true }).fill('80');
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('8');
  await page.getByText('RPE & notes', { exact: true }).click();
  await page.getByRole('textbox', { name: 'RPE optional', exact: true }).fill('9');
  await page.getByRole('textbox', { name: 'Notes optional', exact: true }).fill('Keep this draft');
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
  await expect(page.getByRole('textbox', { name: 'Exercise', exact: true })).toHaveValue('Barbell Curl');
  await expect(page.getByRole('textbox', { name: 'Weight kg', exact: true })).toHaveValue('80');
  await expect(page.getByRole('textbox', { name: 'Reps', exact: true })).toHaveValue('8');
  await expect(page.getByRole('textbox', { name: 'RPE optional', exact: true })).toHaveValue('9');
  await expect(page.getByRole('textbox', { name: 'Notes optional', exact: true })).toHaveValue('Keep this draft');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Exercise', exact: true })).toHaveValue('Barbell Curl');
  expect(errors).toEqual([]);
});
