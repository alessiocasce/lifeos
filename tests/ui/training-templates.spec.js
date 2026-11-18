import { test, expect } from '@playwright/test';
import { selectExercise } from './exercisePicker.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('qa-template-seeded')) return;
    sessionStorage.setItem('qa-template-seeded', 'true');
    localStorage.setItem('qa-workouts', '[]');
    localStorage.setItem('qa-templates', JSON.stringify([
      { id: 'qa-template', user_id: 'qa-user-a', name: 'Strength A', notes: 'Controlled working sets', workout_template_exercises: [
        { id: 'qa-bench', template_id: 'qa-template', exercise: 'Dumbbell Bench Press', exercise_order: 1, notes: 'Controlled eccentric' },
        { id: 'qa-curl', template_id: 'qa-template', exercise: 'Barbell Curl', exercise_order: 2, notes: 'Strict technique' },
      ] },
    ]));
  });
});

const manager = (page) => page.getByRole('group', { name: 'Workout template management' });
const template = (page) => manager(page);
const draftRow = (page, name) => page.locator('[data-draft-row]').filter({ hasText: name });
async function removeTemplate(page) {
  await manager(page).getByRole('button', { name: 'Delete template', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete template?' }).getByRole('button', { name: 'Delete template', exact: true }).click();
}

test('template starts immutable plan, warmup and working sets, and resumes after reload', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Start Strength A', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exercise', exact: true })).toContainText('Dumbbell Bench Press');
  await page.getByRole('textbox', { name: /Weight/ }).fill('25');
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('8');
  await page.getByRole('checkbox', { name: 'Warmup set' }).check();
  await page.getByRole('button', { name: 'Save Set', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Reps', exact: true })).toHaveValue('8');
  await page.getByRole('checkbox', { name: 'Warmup set' }).uncheck();
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('6');
  await page.getByRole('button', { name: 'Save Set', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Exercise', exact: true })).toContainText('Dumbbell Bench Press');
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0]);
  expect(session.template_snapshot.map((row) => row.exercise)).toEqual(['Dumbbell Bench Press', 'Barbell Curl']);
  expect(session.workout_sets.map((row) => row.is_warmup)).toEqual([true, false]);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByRole('button', { name: /Strength A/ }).click();
  await removeTemplate(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Exercise', exact: true })).toContainText('Dumbbell Bench Press');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0].template_snapshot.length)).toBe(2);
});

test('template and exercise drafts save ordering, compaction, rename and confirmed deletion', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Manage' }).click();
  await page.getByRole('button', { name: 'Create template', exact: true }).click();
  const create = page.getByRole('form', { name: 'Create workout template' });
  await create.getByLabel('Template name', { exact: true }).fill('Pull B');
  await expect(create.getByLabel('Notes', { exact: true })).toHaveCount(0);
  for (const name of ['Pull Up', 'Cable Row']) await selectExercise(page, name, { label: 'Add exercise', scope: create });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-templates')).length)).toBe(1);
  await create.getByRole('button', { name: 'Create template', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Edit template', exact: true })).toBeVisible();
  const original = await page.evaluate(() => localStorage.getItem('qa-templates'));
  const second = page.locator('[data-draft-row]').nth(1);
  await second.getByRole('button', { name: /Exercise options/ }).click();
  await second.getByRole('button', { name: 'Move up', exact: true }).click();
  await expect(page.locator('[data-draft-row]').first()).toContainText('Cable Row');
  await page.getByLabel('Template name', { exact: true }).fill('Pull revised');
  expect(await page.evaluate(() => localStorage.getItem('qa-templates'))).toBe(original);
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Template saved.');
  const options = draftRow(page, 'Cable Row').getByRole('button', { name: /Exercise options/ });
  if(await options.getAttribute('aria-expanded') !== 'true') await options.click();
  await draftRow(page, 'Cable Row').getByRole('button', { name: 'Remove exercise', exact: true }).click();
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Manage' }).click();
  await page.getByRole('button', { name: /Pull revised/ }).click();
  await expect(page.locator('[data-draft-row]')).toHaveCount(1);
  await expect(page.locator('[data-draft-row]')).toContainText('Pull Up');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-templates')).find(row => row.name === 'Pull revised'));
  expect(stored.workout_template_exercises[0].exercise_order).toBe(1);
  const save = page.getByRole('button', { name: 'Save template', exact: true });
  const remove = page.getByRole('button', { name: 'Delete template', exact: true });
  expect((await remove.boundingBox()).width).toBeCloseTo((await save.boundingBox()).width, 0);
  expect((await remove.boundingBox()).height).toBe((await save.boundingBox()).height);
  await expect(remove).toHaveCSS('background-color', 'rgb(240, 128, 137)');
  await removeTemplate(page);
  await expect(manager(page)).toHaveCount(0);
});

test('failed template writes retain draft and failed delete retains persisted plan', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Manage' }).click();
  await page.getByRole('button', { name: 'Create template', exact: true }).click();
  await page.evaluate(() => localStorage.setItem('qa-template-fail', 'true'));
  const create = page.getByRole('form', { name: 'Create workout template' });
  await create.getByLabel('Template name').fill('Keep draft');
  await create.getByRole('button', { name: 'Create template' }).click();
  await expect(manager(page).getByRole('alert')).toContainText('not saved');
  await expect(create.getByLabel('Template name')).toHaveValue('Keep draft');
  await page.evaluate(() => localStorage.removeItem('qa-template-fail'));
  await create.getByRole('button', { name: 'Create template' }).click();
  await expect(template(page, 'Keep draft')).toBeVisible();
  await page.getByRole('button', { name: 'Your templates', exact: true }).click();
  await page.getByRole('button', { name: /Strength A/ }).click();
  await page.evaluate(() => localStorage.setItem('qa-template-fail','true'));
  await removeTemplate(page);
  await expect(page.getByRole('dialog', { name: 'Delete template?' }).getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-templates')).some(row => row.name === 'Strength A'))).toBe(true);
});

test('empty session start retains failed fields and starts exactly once', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Start Empty Workout' }).click();
  const form = page.getByRole('form', { name: 'New workout' });
  await form.getByLabel('Workout name', { exact: true }).fill('Custom training');
  await expect(form.getByLabel('Notes', { exact: true })).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('qa-session-fail', 'true'));
  await form.getByRole('button', { name: 'Start workout', exact: true }).click();
  await expect(form.getByLabel('Workout name', { exact: true })).toHaveValue('Custom training');
  await expect(page.getByText('Workout session was not started.', { exact: true })).toBeVisible();
  await page.evaluate(() => { localStorage.removeItem('qa-session-fail'); localStorage.setItem('qa-session-delay', '1000'); });
  await form.getByRole('button', { name: 'Start workout', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Starting', exact: true })).toBeDisabled();
  await expect(form.getByLabel('Workout name', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Exercise', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts')).length)).toBe(1);
});

test('template save locks dismissal and failed draft saves retain corrections for retry', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Manage' }).click();
  await page.getByRole('button', { name: /Strength A/ }).click();
  await page.getByLabel('Template name', { exact: true }).fill('Strength revised');
  await selectExercise(page, 'Dumbbell Curl', { label: 'Add exercise', scope: manager(page) });
  await page.evaluate(() => { localStorage.setItem('qa-template-delay', '1000'); localStorage.setItem('qa-template-fail', 'true'); });
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manage', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Template name', { exact: true })).toBeDisabled();
  await expect(manager(page).getByRole('alert')).toContainText('Retry to finish');
  await expect(page.getByLabel('Template name', { exact: true })).toHaveValue('Strength revised');
  await expect(draftRow(page, 'Dumbbell Curl')).toBeVisible();
  await page.evaluate(() => { localStorage.removeItem('qa-template-delay'); localStorage.removeItem('qa-template-fail'); });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Template saved.');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-templates'))[0]);
  expect(saved.workout_template_exercises).toHaveLength(3);
  expect(saved.workout_template_exercises[0].id).toBe('qa-bench');
  expect(saved.workout_template_exercises[0].notes).toBe('Controlled eccentric');
});

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932], [1280, 800], [1440, 900], [1920, 1080]]) {
  test('Training setup and templates fit ' + width + 'x' + height, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/workout');
    await expect(page.getByRole('button', { name: 'Start Strength A' })).toBeVisible();
    await page.screenshot({ path: info.outputPath('training-setup.png'), fullPage: true });
    await page.getByRole('button', { name: 'Manage' }).click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('training-templates.png'), fullPage: true });
    await page.getByRole('button', { name: /Strength A/ }).click();
    const add = template(page, 'Strength A').getByRole('button', { name: 'Add exercise', exact: true });
    await add.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: info.outputPath('training-template-controls.png') });
    if (width < 768) {
      const addBounds = await add.boundingBox();
      const navigationBounds = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox();
      expect(addBounds.y + addBounds.height).toBeLessThanOrEqual(navigationBounds.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await template(page, 'Strength A').getByRole('button', { name: /Exercise options/ }).first().boundingBox();
    expect(Math.round(bounds.width)).toBeGreaterThanOrEqual(44); expect(Math.round(bounds.height)).toBeGreaterThanOrEqual(44);
    const firstExercise = template(page, 'Strength A').locator('[data-draft-row]').first();
    const rowBounds = await firstExercise.boundingBox();
    expect(rowBounds.height).toBeLessThanOrEqual(80);
    expect(bounds.y).toBeGreaterThanOrEqual(rowBounds.y);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(rowBounds.y + rowBounds.height);
    await expect(firstExercise.locator('.training-exercise-number')).toHaveText('01');
    await page.screenshot({ path: info.outputPath('compact-manage.png') });
    expect(errors).toEqual([]);
  });
}
