import { test, expect } from '@playwright/test';
import { localDate } from '../../src/utils/date.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript((today) => {
    if (sessionStorage.getItem('prefill-seeded')) return;
    sessionStorage.setItem('prefill-seeded', 'true');
    const set = (id, number, weight, reps, warmup = false) => ({ id, exercise: 'Bench Press', set_number: number, weight, reps, is_warmup: warmup, rpe: 9, notes: 'Historical outcome' });
    localStorage.setItem('qa-workouts', JSON.stringify([
      { id: 'current', user_id: 'qa-user-a', name: 'Push Day', performed_on: today, started_at: today + 'T12:00:00Z', workout_sets: [] },
      { id: 'previous', user_id: 'qa-user-a', name: 'Last Push', performed_on: '2026-09-28', started_at: '2026-09-28T12:00:00Z', ended_at: '2026-09-28T13:00:00Z', workout_sets: [
        set('w1', 1001, 40, 10, true), set('w2', 1002, 60, 6, true), set('s1', 1, 80, 8), set('s2', 2, 80, 7), set('s3', 3, 77.5, 8),
      ] },
    ]));
  }, localDate());
});
const field = (page, name) => page.getByRole('textbox', { name, exact: true });

test('committed exercise and saved sets prefill targets, never outcomes or manual values', async ({ page }) => {
  await page.goto('/workout');
  await field(page, 'Exercise').fill('Bench');
  await expect(field(page, 'Weight kg')).toHaveValue('');
  await page.getByRole('button', { name: 'Bench Press', exact: true }).click();
  await expect(field(page, 'Weight kg')).toHaveValue('80');
  await expect(field(page, 'Reps')).toHaveValue('8');
  await field(page, 'Weight kg').fill('82.5');
  await field(page, 'Exercise').focus();
  await field(page, 'Exercise').press('Tab');
  await expect(field(page, 'Weight kg')).toHaveValue('82.5');
  await page.getByText('RPE & notes', { exact: true }).click();
  await expect(field(page, 'RPE optional')).toHaveValue('');
  await field(page, 'RPE optional').fill('8');
  await field(page, 'Notes optional').fill('Actual outcome');
  await page.getByRole('button', { name: 'Save Set', exact: true }).click();
  await expect(field(page, 'Weight kg')).toHaveValue('80');
  await expect(field(page, 'Reps')).toHaveValue('7');
  await expect(field(page, 'RPE optional')).toHaveValue('');
  await expect(field(page, 'Notes optional')).toHaveValue('');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /Last Push/ }).click();
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(field(page, 'Reps')).toHaveValue('7');
  await page.reload();
  await expect(field(page, 'Reps')).toHaveValue('7');
  await field(page, 'Weight kg').fill('');
  await field(page, 'Reps').fill('');
  await page.getByRole('checkbox', { name: 'Warmup set' }).check();
  await expect(field(page, 'Weight kg')).toHaveValue('40');
  await expect(field(page, 'Reps')).toHaveValue('10');
  await page.getByRole('button', { name: 'Save Warmup', exact: true }).click();
  await expect(field(page, 'Weight kg')).toHaveValue('60');
  await expect(field(page, 'Reps')).toHaveValue('6');
});

test('rest settings and countdown survive reload; failed save, Off and end are safe', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/workout');
  await page.getByRole('button', { name: /Rest timer/ }).click();
  await page.getByRole('checkbox', { name: 'WhatsApp rest alerts' }).check();
  await field(page, 'Exercise').fill('Bench Press');
  await field(page, 'Exercise').press('Tab');
  await page.evaluate(() => localStorage.setItem('qa-fail-save', 'true'));
  await page.getByRole('button', { name: 'Save Set', exact: true }).click();
  await expect(page.getByRole('timer')).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem('qa-fail-save'));
  await page.getByRole('button', { name: 'Save Set', exact: true }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  const countdown = (await page.getByRole('timer').innerText()).split(':').map(Number);
  expect(countdown[0] * 60 + countdown[1]).toBeLessThanOrEqual(120);
  const due = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-rest-timer')).scheduled_for);
  await page.getByRole('spinbutton', { name: 'Rest duration seconds' }).fill('180');
  await page.getByRole('button', { name: 'Save duration', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-rest-timer')).scheduled_for)).toBe(due);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('rest-timer-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.getByRole('button', { name: /Rest timer/ }).click();
  await page.getByRole('checkbox', { name: 'WhatsApp rest alerts' }).uncheck();
  await expect(page.getByRole('timer')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'WhatsApp rest alerts' }).check();
  await page.getByRole('button', { name: 'Save Set', exact: true }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.getByRole('button', { name: 'End Workout', exact: true }).click();
  await expect(page.getByRole('timer')).toHaveCount(0);
  expect(errors).toEqual([]);
});
