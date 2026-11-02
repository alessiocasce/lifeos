import { test, expect } from '@playwright/test';
import { selectExercise } from './exercisePicker.js';
import { normalizeTemplateAppearance, quickStartTemplates, SUGGESTED_TEMPLATES } from '../../src/utils/templateAppearance.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('qa-live-manage')) return;
    sessionStorage.setItem('qa-live-manage', '1');
    localStorage.setItem('qa-workouts', '[]');
    localStorage.setItem('qa-templates', '[]');
  });
});

test('appearance allowlists and suggestion matching', () => {
  expect(normalizeTemplateAppearance({ color_key: 'url(evil)', icon_key: '__proto__' })).toEqual({ color_key: 'slate', icon_key: 'dumbbell' });
  const template = { id: 'real', name: ' chest + TRICEPS ' };
  const cards = quickStartTemplates([template, { id: 'extra', name: 'Custom' }]);
  expect(cards).toHaveLength(6);
  expect(cards[0]).toBe(template);
  expect(SUGGESTED_TEMPLATES.map((row) => row.icon_key)).toEqual(['chest', 'back', 'quads', 'hamstrings', 'shoulders']);
});

test('suggestion setup, real start, appearance persistence and immutable snapshots', async ({ page }) => {
  await page.goto('/workout');
  await expect(page.getByRole('heading', { name: 'Start your workout', exact: true })).toBeVisible();
  await expect(page.getByText("Today's workout", { exact: true })).toHaveCount(0);
  const quick = page.getByRole('region', { name: 'Quick start' });
  await expect(quick.getByRole('button')).toHaveCount(5);
  for (const suggestion of SUGGESTED_TEMPLATES) {
    await expect(quick.getByRole('button', { name: `Set up ${suggestion.name}`, exact: true }).locator('svg[data-icon]')).toHaveAttribute('data-icon', suggestion.icon_key);
  }
  await quick.getByRole('button', { name: 'Set up Quads', exact: true }).click();
  const create = page.getByRole('form', { name: 'Create workout template' });
  await expect(create.getByLabel('Template name')).toHaveValue('Quads');
  await expect(create.getByRole('button', { name: 'Green', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(create.getByRole('button', { name: 'Quadriceps', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-templates')))).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts')))).toEqual([]);
  await create.getByRole('button', { name: 'Create template', exact: true }).click();
  const row = page.getByRole('article', { name: 'Template Quads', exact: true });
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await quick.getByRole('button', { name: 'Set up Quads', exact: true }).click();
  await expect(row.getByRole('group', { name: 'Edit template', exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Cancel template edit' }).click();
  const add = row.getByRole('group', { name: 'Add template exercise' });
  await selectExercise(page, 'Leg Press', { label: 'Add exercise', scope: add });
  await add.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await expect(row.getByRole('group', { name: /^Template exercise/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await quick.getByRole('button', { name: 'Start Quads', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Exercise', exact: true })).not.toHaveValue('');
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0]);
  expect(session.template_snapshot).toHaveLength(1);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await row.getByRole('button', { name: 'Edit template', exact: true }).click();
  const edit = row.getByRole('group', { name: 'Edit template', exact: true });
  await edit.getByRole('button', { name: 'Pink', exact: true }).click();
  await edit.getByRole('button', { name: 'Boxing', exact: true }).click();
  await row.getByRole('button', { name: 'Save template' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0])).toEqual(session);
  await page.reload();
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await row.getByRole('button', { name: 'Edit template', exact: true }).click();
  await expect(edit.getByRole('button', { name: 'Pink', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(edit.getByRole('button', { name: 'Boxing', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

for (const width of [390, 768, 1024, 1440]) {
  test(`Live and Manage fit ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/workout');
    await expect(page.getByRole('button', { name: 'Set up Hamstrings', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('live.png'), fullPage: true });
    await page.getByRole('button', { name: 'Manage', exact: true }).click();
    await page.getByRole('form', { name: 'Create workout template' }).getByLabel('Template name').fill('A long custom training template name');
    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await page.getByRole('button', { name: 'Manage', exact: true }).click();
    await expect(page.getByLabel('Template name')).toHaveValue('A long custom training template name');
    await page.screenshot({ path: info.outputPath('manage.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
