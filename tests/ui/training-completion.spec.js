import { test, expect } from '@playwright/test';
import { resolveExercise } from '../../src/utils/exerciseCatalog.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

async function seed(page, long = false) {
  await page.addInitScript(({ long, id }) => {
    if (sessionStorage.getItem('completion-seeded')) return;
    sessionStorage.setItem('completion-seeded', '1');
    const now = new Date();
    localStorage.setItem('qa-workouts', JSON.stringify([{
      id: 'completion-workout', user_id: 'qa-user-a', name: long ? 'Strength and accessories - full training session' : 'Chest',
      performed_on: now.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }),
      started_at: new Date(now.getTime() - 45 * 60000).toISOString(), ended_at: null,
      workout_sets: Array.from({ length: long ? 24 : 1 }, (_, index) => ({
        id: 'completion-set-' + index, workout_id: 'completion-workout', user_id: 'qa-user-a',
        exercise: long ? ['Barbell Bench Press','Custom accessory with a longer exercise name','Bodyweight finisher'][Math.floor(index / 8)] : 'Barbell Bench Press',
        exercise_id: !long || index < 8 ? id : null,
        set_number: index % 8 + 1, is_warmup: index === 0 && long, weight: 30, reps: 10,
        rpe: index % 2 ? 8.5 : null, notes: index === 3 ? 'Controlled tempo. Keep shoulders comfortable.' : null,
        performed_at: now.toISOString(),
      })),
    }]));
  }, { long, id: resolveExercise('Barbell Bench Press').id });
}

for (const width of [375,390,430]) test('persisted completion and History navigation at ' + width, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await seed(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/workout');
  await page.evaluate(() => localStorage.setItem('qa-session-update-fail', 'true'));
  await page.getByRole('button', { name: 'End Workout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workout completed!' })).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem('qa-session-update-fail'));
  await page.getByRole('button', { name: 'End Workout', exact: true }).click();
  const completed = page.getByRole('region', { name: 'Completed workout', exact: true });
  await expect(completed).toBeVisible();
  await expect(completed).toContainText('1 set');
  await expect(completed).not.toContainText('1 sets');
  await expect(completed).toContainText('300');
  await expect(completed).toContainText('30 kg × 10');
  await expect(completed.getByRole('button', { name: /Save set|Edit set/ })).toHaveCount(0);
  if (width === 390) await page.screenshot({ path: info.outputPath('completion-short.png') });
  const before = await page.evaluate(() => localStorage.getItem('qa-workouts'));
  await completed.getByRole('button', { name: 'View history', exact: true }).click();
  await expect(page.getByLabel('Historical workout detail', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await completed.getByRole('button', { name: 'Back to training', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Start your workout', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('qa-workouts'))).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('long completion uses recorded exercises, omits unreliable volume and clears dock', async ({ page }, info) => {
  await seed(page, true);
  await page.goto('/workout');
  await page.getByRole('button', { name: 'End Workout', exact: true }).click();
  const completed = page.getByRole('region', { name: 'Completed workout', exact: true });
  await expect(completed.locator('.completion-exercise')).toHaveCount(3);
  await expect(completed.getByText('Load-volume', { exact: true })).toHaveCount(0);
  await expect(completed).toContainText('RPE 8.5');
  await expect(completed).toContainText('Controlled tempo.');
  await page.screenshot({ path: info.outputPath('completion-long.png') });
  await page.evaluate(() => scrollTo(0,document.documentElement.scrollHeight));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const bottom = await completed.getByRole('button', { name: 'View history', exact: true }).boundingBox();
  const dock = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox();
  expect(bottom.y + bottom.height).toBeLessThan(dock.y);
  await page.screenshot({ path: info.outputPath('completion-long-bottom.png') });
});
