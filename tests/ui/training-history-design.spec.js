import { test, expect } from '@playwright/test';
import { resolveExercise } from '../../src/utils/exerciseCatalog.js';

const names = ['Incline Barbell Bench Press', 'Dumbbell Bench Press', 'Pectoral Machine'];
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(({ names, ids }) => {
    if (sessionStorage.getItem('history-design-seeded')) return;
    sessionStorage.setItem('history-design-seeded', 'true');
    localStorage.setItem('qa-workouts', JSON.stringify([{
      id: 'design-chest', user_id: 'qa-user-a', name: 'Chest', performed_on: '2026-10-28',
      started_at: '2026-10-28T09:00:00Z', ended_at: '2026-10-28T10:00:00Z', updated_at: '2026-10-28T10:00:00Z',
      template_appearance: { color_key: 'blue', icon_key: 'chest' }, template_snapshot: [{ exercise: 'Unperformed plan exercise' }],
      workout_sets: names.flatMap((exercise, e) => [1,2,3].map(number => ({
        id: 'design-' + e + '-' + number, workout_id: 'design-chest', user_id: 'qa-user-a',
        exercise, exercise_id: ids[e], set_number: number, is_warmup: false,
        weight: e === 0 ? 50 : e === 1 ? 30 : 40, reps: number === 3 ? 12 : 10,
        rpe: number === 1 ? 8.5 : number === 2 ? 10 : null,
        notes: e === 0 && number === 2 ? 'Paused last rep' : null,
        performed_at: '2026-10-28T09:30:00Z', updated_at: '2026-10-28T10:00:00Z',
      }))),
    }]));
  }, { names, ids: names.map(name => resolveExercise(name)?.id || null) });
});

const history = page => page.getByLabel('Historical workout detail', { exact: true });
const editor = page => page.getByRole('form', { name: 'Historical set editor' });
async function openHistory(page) {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /Chest/ }).click();
}
for (const width of [375,390,430]) test('approved History mobile layout and inline editing at ' + width, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openHistory(page);
  const snap = async name => { if (width === 390) await page.screenshot({ path: info.outputPath(name + '.png') }); };
  const revealEditor = async () => {
    await editor(page).scrollIntoViewIfNeeded();
    const nav = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox();
    const bounds = await editor(page).boundingBox();
    await page.evaluate(delta => scrollBy(0, delta), Math.max(0, bounds.y + bounds.height - nav.y + 12));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const settled = await editor(page).boundingBox();
    await page.evaluate(delta => scrollBy(0, delta), Math.max(0, settled.y + settled.height - nav.y + 12));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    const save = await editor(page).getByRole('button', { name: 'Save set', exact: true }).boundingBox();
    expect(save.y + save.height).toBeLessThan(nav.y);
  };
  await expect(history(page).locator('.history-exercise-summary')).toHaveCount(3);
  await expect(history(page).getByText('Session complete', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View in Community' })).toHaveCount(0);
  await expect(history(page).getByText('Unperformed plan exercise')).toHaveCount(0);
  await expect(history(page).locator('.history-set-row')).toHaveCount(0);
  expect(await history(page).evaluate(el => getComputedStyle(el).getPropertyValue('--history-accent').trim())).toBe('#3B82F6');
  await snap('01-readonly');
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Chest');
  await expect(page.getByLabel('Name', { exact: true })).not.toBeFocused();
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-10-28');
  await page.getByLabel('Name', { exact: true }).fill('Chest corrected');
  await page.getByLabel('Date', { exact: true }).fill('2026-10-27');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0);
  await snap('02-workout-editing');
  await page.getByRole('button', { name: 'Edit ' + names[0], exact: true }).click();
  await expect(history(page).locator('.history-set-row')).toHaveCount(3);
  await expect(history(page).locator('.history-set-row').nth(1)).toContainText('Set 2');
  await expect(history(page).locator('.history-set-row').nth(1)).toContainText('50 kg × 10');
  await expect(history(page).locator('.history-set-row').nth(1)).toContainText('RPE 10');
  await snap('03-exercise-expanded');
  await page.getByRole('button', { name: 'Edit set design-0-2', exact: true }).click();
  await expect(editor(page)).toHaveCount(1);
  await expect(history(page).locator('.history-set').nth(1).getByRole('form')).toHaveCount(1);
  await expect(editor(page).getByRole('checkbox', { name: 'Warmup', exact: true })).toBeVisible();
  await expect(editor(page).getByRole('combobox', { name: 'RPE', exact: true })).toHaveValue('10');
  await expect(editor(page).getByRole('textbox', { name: 'Set notes', exact: true })).toHaveValue('Paused last rep');
  await revealEditor();
  await snap('04-set-2-inline');
  await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Edit set design-0-1', exact: true }).click();
  await expect(editor(page).getByRole('combobox', { name: 'RPE', exact: true })).toHaveValue('8.5');
  await editor(page).getByRole('textbox', { name: 'Reps', exact: true }).fill('11');
  await editor(page).getByRole('button', { name: 'Save set', exact: true }).click();
  await expect(editor(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Add set', exact: true }).click();
  await expect(editor(page).getByRole('textbox', { name: 'Reps', exact: true })).toHaveValue('');
  await revealEditor();
  await snap('05-add-set');
  await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Back to workout', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Done editing', exact: true })).toBeVisible();
  await expect(history(page).locator('.history-set-row')).toHaveCount(0);
  await page.getByLabel('Name', { exact: true }).fill('Chest corrected');
  await page.getByLabel('Date', { exact: true }).fill('2026-10-27');
  await page.getByRole('button', { name: 'Done editing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chest corrected', exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0]);
  expect(saved.ended_at).toBe('2026-10-28T10:00:00Z');
  expect(saved.performed_on).toBe('2026-10-27');
  expect(saved.workout_sets[0].rpe).toBe(8.5);
  expect(saved.workout_sets).toHaveLength(9);
  expect(saved.template_snapshot).toEqual([{ exercise: 'Unperformed plan exercise' }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('long historical detail clears the opaque dock and preserves destructive guards', async ({ page }, info) => {
  await openHistory(page);
  await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('qa-workouts'));
    rows[0].workout_sets = rows[0].workout_sets.flatMap(set => Array.from({ length: 4 }, (_, i) => ({
      ...set, id: set.id + '-' + i, set_number: (set.set_number - 1) * 4 + i + 1,
    })));
    localStorage.setItem('qa-workouts', JSON.stringify(rows));
  });
  await page.reload();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /Chest/ }).click();
  for (const name of names) await page.getByRole('button', { name: 'Show ' + name, exact: true }).click();
  await page.evaluate(() => scrollTo(0,document.documentElement.scrollHeight));
  const dock = page.getByRole('navigation', { name: 'Mobile navigation' });
  const bounds = await dock.boundingBox();
  const last = await history(page).locator('.history-set').last().boundingBox();
  expect(last.y + last.height).toBeLessThan(bounds.y);
  expect(await dock.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(8, 15, 19)');
  await page.screenshot({ path: info.outputPath('06-long-workout-bottom.png') });
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
  await page.getByRole('button', { name: 'Edit ' + names[0], exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete exercise from workout' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Exercise options ' + names[0], exact: true }).click();
  await page.getByRole('button', { name: 'Delete exercise from workout', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets.length)).toBe(36);
});

test('inline workout details keep failed saves and Back to workout protects a dirty set', async ({ page }) => {
  await openHistory(page);
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Chest revised');
  await page.evaluate(() => localStorage.setItem('qa-session-update-fail','true'));
  await page.getByRole('button', { name: 'Done editing', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not saved');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Chest revised');
  await page.evaluate(() => localStorage.removeItem('qa-session-update-fail'));
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit ' + names[0], exact: true }).click();
  await page.getByRole('button', { name: 'Edit set design-0-2', exact: true }).click();
  await editor(page).getByRole('textbox', { name: 'Reps', exact: true }).fill('11');
  await page.getByRole('button', { name: 'Back to workout', exact: true }).click();
  await expect(editor(page)).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Save or cancel');
  await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Back to workout', exact: true }).click();
  await expect(editor(page)).toHaveCount(0);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Chest revised');
  await expect(page.getByRole('button', { name: 'Back to History', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done editing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chest revised', exact: true })).toBeVisible();
});
