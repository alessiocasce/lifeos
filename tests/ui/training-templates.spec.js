import { test, expect } from '@playwright/test';

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
const template = (page, name) => page.getByRole('article', { name: 'Template ' + name });

test('template starts immutable plan, warmup and working sets, and resumes after reload', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Start Strength A', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Exercise', exact: true })).toHaveValue('Dumbbell Bench Press');
  await page.getByRole('textbox', { name: /Weight/ }).fill('25');
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('8');
  await page.getByRole('checkbox', { name: 'Warmup set' }).check();
  await page.getByRole('button', { name: 'Save Warmup', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Reps', exact: true })).toHaveValue('');
  await page.getByRole('checkbox', { name: 'Warmup set' }).uncheck();
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('6');
  await page.getByRole('button', { name: 'Save Set', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Exercise', exact: true })).toHaveValue('Dumbbell Bench Press');
  await expect(page.getByText('Set 2', { exact: true })).toBeVisible();
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0]);
  expect(session.template_snapshot.map((row) => row.exercise)).toEqual(['Dumbbell Bench Press', 'Barbell Curl']);
  expect(session.workout_sets.map((row) => row.is_warmup)).toEqual([true, false]);
  await page.getByRole('button', { name: 'Session options', exact: true }).click();
  await page.getByRole('button', { name: 'Manage templates', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await template(page, 'Strength A').getByRole('button', { name: 'Delete template', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Exercise', exact: true })).toHaveValue('Dumbbell Bench Press');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0].template_snapshot.length)).toBe(2);
});

test('template and exercise CRUD, notes, ordering and compaction remain functional', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Manage templates' }).click();
  const create = page.getByRole('form', { name: 'Create workout template' });
  await create.getByLabel('Template name', { exact: true }).fill('Pull B');
  await create.getByLabel('Notes', { exact: true }).fill('Second pull day');
  await create.getByRole('button', { name: 'Create template' }).click();
  const row = template(page, 'Pull B');
  await expect(row).toContainText('Second pull day');
  const add = row.getByRole('group', { name: 'Add template exercise' });
  for (const name of ['Pull Up', 'Cable Row']) {
    await add.getByLabel('Add exercise', { exact: true }).fill(name);
    await add.getByLabel('Notes', { exact: true }).fill('Keep full range');
    await add.getByRole('button', { name: 'Add exercise', exact: true }).click();
    await expect(add.getByLabel('Add exercise', { exact: true })).toHaveValue('');
  }
  await row.getByRole('group', { name: 'Template exercise Cable Row' }).getByRole('button', { name: 'Move up' }).click();
  await expect(row.getByRole('group', { name: /^Template exercise/ }).first()).toContainText('Cable Row');
  const exercise = row.getByRole('group', { name: 'Template exercise Cable Row' });
  await exercise.getByRole('button', { name: 'Edit exercise' }).click();
  await exercise.getByLabel('Exercise', { exact: true }).fill('Seated Cable Row');
  await exercise.getByRole('button', { name: 'Save exercise' }).click();
  await row.getByRole('button', { name: 'Edit template', exact: true }).click();
  await row.getByRole('group', { name: 'Edit template', exact: true }).getByLabel('Template name').fill('Pull revised');
  await row.getByRole('button', { name: 'Save template', exact: true }).click();
  const revised = template(page, 'Pull revised');
  page.once('dialog', (dialog) => dialog.accept());
  await revised.getByRole('group', { name: 'Template exercise Seated Cable Row' }).getByRole('button', { name: 'Delete exercise' }).click();
  await expect(revised.getByRole('group', { name: /^Template exercise/ })).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: 'Manage templates' }).click();
  await expect(revised).toContainText('Pull Up');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-templates')).find((row) => row.name === 'Pull revised'));
  expect(stored.workout_template_exercises[0].exercise_order).toBe(1);
  page.once('dialog', (dialog) => dialog.accept());
  await revised.getByRole('button', { name: 'Delete template', exact: true }).click();
  await expect(revised).toHaveCount(0);
});

test('failed template writes retain draft and failed delete retains persisted plan', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Manage templates' }).click();
  await page.evaluate(() => localStorage.setItem('qa-template-fail', 'true'));
  const create = page.getByRole('form', { name: 'Create workout template' });
  await create.getByLabel('Template name').fill('Keep draft');
  await create.getByRole('button', { name: 'Create template' }).click();
  await expect(manager(page).getByRole('alert')).toContainText('not saved');
  await expect(create.getByLabel('Template name')).toHaveValue('Keep draft');
  page.once('dialog', (dialog) => dialog.accept());
  await template(page, 'Strength A').getByRole('button', { name: 'Delete template' }).click();
  await expect(template(page, 'Strength A')).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('qa-template-fail'));
  await create.getByRole('button', { name: 'Create template' }).click();
  await expect(template(page, 'Keep draft')).toBeVisible();
});

test('empty session start retains failed fields and starts exactly once', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Start Empty Workout' }).click();
  const form = page.getByRole('form', { name: 'Start empty workout' });
  await form.getByLabel('Name', { exact: true }).fill('Custom training');
  await form.getByLabel('Notes', { exact: true }).fill('No template today');
  await page.evaluate(() => localStorage.setItem('qa-session-fail', 'true'));
  await form.getByRole('button', { name: 'Start Empty', exact: true }).click();
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Custom training');
  await expect(page.getByText('Workout session was not started.', { exact: true })).toBeVisible();
  await page.evaluate(() => { localStorage.removeItem('qa-session-fail'); localStorage.setItem('qa-session-delay', '1000'); });
  await form.getByRole('button', { name: 'Start Empty', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Starting', exact: true })).toBeDisabled();
  await expect(form.getByLabel('Name', { exact: true })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Exercise', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts')).length)).toBe(1);
});

test('template save locks dismissal and failed exercise edit retains corrections', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Manage templates' }).click();
  const row = template(page, 'Strength A');
  const exercise = row.getByRole('group', { name: 'Template exercise Barbell Curl' });
  await exercise.getByRole('button', { name: 'Edit exercise' }).click();
  await exercise.getByLabel('Exercise', { exact: true }).fill('Dumbbell Curl');
  await page.evaluate(() => {
    localStorage.setItem('qa-template-delay', '1000');
    localStorage.setItem('qa-template-fail', 'true');
  });
  await exercise.getByRole('button', { name: 'Save exercise' }).click();
  await expect(page.getByRole('button', { name: 'Manage templates', exact: true })).toBeDisabled();
  await expect(exercise.getByLabel('Exercise', { exact: true })).toBeDisabled();
  await expect(manager(page).getByRole('alert')).toContainText('not saved');
  await expect(exercise.getByLabel('Exercise', { exact: true })).toHaveValue('Dumbbell Curl');
  await expect(page.getByRole('button', { name: 'Manage templates', exact: true })).toBeEnabled();
  await page.evaluate(() => { localStorage.removeItem('qa-template-delay'); localStorage.removeItem('qa-template-fail'); });
  await exercise.getByRole('button', { name: 'Save exercise' }).click();
  await expect(row.getByRole('group', { name: 'Template exercise Dumbbell Curl' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-templates'))[0].workout_template_exercises.length)).toBe(2);
});

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932], [1280, 800], [1440, 900], [1920, 1080]]) {
  test('Training setup and templates fit ' + width + 'x' + height, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/workout');
    await expect(page.getByRole('button', { name: 'Start Strength A' })).toBeVisible();
    await page.screenshot({ path: info.outputPath('training-setup.png'), fullPage: true });
    await page.getByRole('button', { name: 'Manage templates' }).click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('training-templates.png'), fullPage: true });
    const add = template(page, 'Strength A').getByRole('button', { name: 'Add exercise', exact: true });
    await add.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: info.outputPath('training-template-controls.png') });
    if (width < 768) {
      const addBounds = await add.boundingBox();
      const navigationBounds = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox();
      expect(addBounds.y + addBounds.height).toBeLessThanOrEqual(navigationBounds.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await template(page, 'Strength A').getByRole('button', { name: 'Edit exercise' }).first().boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(errors).toEqual([]);
  });
}
