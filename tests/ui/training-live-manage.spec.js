import { test, expect } from '@playwright/test';
import { selectExercise } from './exercisePicker.js';
import { normalizeTemplateAppearance, TEMPLATE_ICONS } from '../../src/utils/templateAppearance.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('qa-live-manage')) return;
    sessionStorage.setItem('qa-live-manage', '1');
    localStorage.setItem('qa-workouts', '[]');
    localStorage.setItem('qa-templates', '[]');
  });
});

test('appearance allowlists preserve saved customizations', () => {
  expect(normalizeTemplateAppearance({ color_key: 'url(evil)', icon_key: '__proto__' })).toEqual({ color_key: 'slate', icon_key: 'dumbbell' });
  for (const icon_key of Object.keys(TEMPLATE_ICONS)) expect(normalizeTemplateAppearance({ color_key: 'pink', icon_key })).toEqual({ color_key: 'pink', icon_key });
});

test('only persisted templates render, including zero, one, three and ten in loaded order', async ({ page }) => {
  await page.goto('/workout');
  const quick = page.getByRole('region', { name: 'Templates', exact: true });
  await expect(quick.getByText('No templates yet.', { exact: true })).toBeVisible();
  await expect(page.locator('.training-template-list .training-template-card')).toHaveCount(0);
  for (const count of [1, 3, 10]) {
    const rows = Array.from({ length: count }, (_, i) => ({ id: `saved-${i}`, user_id: 'qa-user-a', name: `My saved plan ${i}`, color_key: 'cyan', icon_key: 'back', workout_template_exercises: [] }));
    await page.evaluate(rows => localStorage.setItem('qa-templates', JSON.stringify(rows)), rows);
    await page.reload();
    await expect(page.locator('.training-template-list .training-template-card')).toHaveCount(count);
    await expect(quick.locator('.training-template-name')).toHaveText(rows.map(row => row.name));
    for (const name of ['Chest + Triceps', 'Back + Biceps', 'Quads', 'Hamstrings', 'Shoulders + Arms']) await expect(quick.getByText(name, { exact: true })).toHaveCount(0);
  }
});

test('empty state, real start, icon persistence, rename/delete and immutable snapshots', async ({ page }, info) => {
  await page.goto('/workout');
  await expect(page.getByRole('heading', { name: 'Start your workout', exact: true })).toBeVisible();
  await expect(page.getByText("Today's workout", { exact: true })).toHaveCount(0);
  const quick = page.getByRole('region', { name: 'Templates', exact: true });
  await quick.getByRole('button', { name: 'Create template', exact: true }).click();
  const create = page.getByRole('form', { name: 'Create workout template' });
  await expect(create.getByLabel('Template name')).toHaveValue('');
  await create.getByLabel('Template name').fill('My legs');
  await create.getByText('Edit appearance', { exact: true }).click();
  await create.getByRole('button', { name: 'Purple', exact: true }).click();
  for (const [key, label] of Object.entries(TEMPLATE_ICONS)) {
    const choice = create.getByRole('button', { name: label, exact: true });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await expect(create.locator('svg[data-icon]').first()).toHaveAttribute('data-icon', key);
  }
  await create.getByRole('button', { name: 'Quadriceps', exact: true }).click();
  await create.screenshot({ path: info.outputPath('icon-picker.png') });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-templates')))).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts')))).toEqual([]);
  await create.getByRole('button', { name: 'Create template', exact: true }).click();
  const row = page.getByRole('article', { name: 'Template My legs', exact: true });
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(quick.getByRole('button')).toHaveCount(1);
  await quick.getByRole('button', { name: 'Set up My legs', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts')))).toEqual([]);
  await expect(row.getByRole('group', { name: 'Edit template', exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Cancel template edit' }).click();
  const add = row.getByRole('group', { name: 'Add template exercise' });
  await selectExercise(page, 'Leg Press', { label: 'Add exercise', scope: add });
  await add.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await expect(row.getByRole('group', { name: /^Template exercise/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await quick.getByRole('button', { name: 'Start My legs', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Exercise', exact: true })).not.toHaveValue('');
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0]);
  expect(session.template_snapshot).toHaveLength(1);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await row.getByRole('button', { name: 'Edit template', exact: true }).click();
  const edit = row.getByRole('group', { name: 'Edit template', exact: true });
  await edit.getByText('Edit appearance', { exact: true }).click();
  await edit.getByRole('button', { name: 'Pink', exact: true }).click();
  await edit.getByRole('button', { name: 'Boxing', exact: true }).click();
  await row.getByRole('button', { name: 'Save template' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0])).toEqual(session);
  await page.reload();
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByRole('button', { name: /My legs/ }).click();
  await row.getByRole('button', { name: 'Edit template', exact: true }).click();
  await edit.getByText('Edit appearance', { exact: true }).click();
  await expect(edit.getByRole('button', { name: 'Pink', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(edit.getByRole('button', { name: 'Boxing', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await edit.getByLabel('Template name').fill('My revised legs');
  await row.getByRole('button', { name: 'Save template' }).click();
  const revised = page.getByRole('article', { name: 'Template My revised legs', exact: true });
  page.once('dialog', dialog => dialog.accept());
  await revised.getByRole('button', { name: 'Delete template', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await expect(revised).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-templates')))).toEqual([]);
});

for (const width of [390, 768, 1024, 1440]) {
  test(`Live and Manage fit ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/workout');
    await page.evaluate(() => localStorage.setItem('qa-templates', JSON.stringify([
      { id: 'one', user_id: 'qa-user-a', name: 'My first plan', color_key: 'red', icon_key: 'chest', workout_template_exercises: [] },
      { id: 'two', user_id: 'qa-user-a', name: 'My second plan', color_key: 'green', icon_key: 'hamstrings', workout_template_exercises: [] },
    ])));
    await page.reload();
    await expect(page.getByRole('button', { name: 'Set up My second plan', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Templates', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Quick start', exact: true })).toHaveCount(0);
    await expect(page.locator('.training-live-badge')).toHaveText('LIVE');
    const rows = await page.locator('.training-template-list .training-template-card').evaluateAll(elements => elements.map(el => {
      const box = el.getBoundingClientRect();
      return { x:box.x,y:box.y,width:box.width,height:box.height };
    }));
    expect(rows).toHaveLength(2);
    for (let i=1;i<rows.length;i++) {
      expect(Math.abs(rows[i].x-rows[0].x)).toBeLessThan(1);
      expect(rows[i].y).toBeGreaterThanOrEqual(rows[i-1].y+rows[i-1].height);
      expect(rows[i].width).toBe(rows[0].width);
    }
    await expect(page.locator('.training-template-list')).not.toContainText('5 exercises');
    await expect(page.locator('.training-empty-card')).toBeVisible();
    expect(await page.locator('.training-empty-card').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 255, 255)');
    await page.screenshot({ path: info.outputPath('live.png'), fullPage: true });
    await page.getByRole('button', { name: 'Manage', exact: true }).click();
    await page.getByRole('button', { name: 'Create template', exact: true }).click();
    await page.getByRole('form', { name: 'Create workout template' }).getByLabel('Template name').fill('A long custom training template name');
    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await page.getByRole('button', { name: 'Manage', exact: true }).click();
    await expect(page.getByLabel('Template name')).toHaveValue('A long custom training template name');
    await page.screenshot({ path: info.outputPath('manage.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
