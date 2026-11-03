import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  page.on('dialog', () => { throw new Error('Unexpected native browser dialog'); });
  await page.goto('/workout?history-preview=1');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /Chest/ }).click();
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
});

test('one edit session retains name and date through set saves and saves only on Done', async ({ page }, info) => {
  await page.getByLabel('Name', { exact: true }).fill('Chest Day');
  await page.getByLabel('Date', { exact: true }).fill('2026-10-27');
  await page.screenshot({ path: info.outputPath('history-unified-draft.png') });
  await page.getByRole('button', { name: 'Edit Incline Barbell Bench Press', exact: true }).click();
  await page.getByRole('button', { name: 'Edit set preview-0-2', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Historical set editor' });
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('12');
  await page.getByRole('button', { name: 'Done editing', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Save or cancel');
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Save set', exact: true }).click();
  await page.getByRole('button', { name: 'Back to workout', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Dumbbell Bench Press', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Chest Day');
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-10-27');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0]);
  expect(before.name).toBe('Chest');
  expect(before.performed_on).toBe('2026-10-28');
  await page.getByRole('button', { name: 'Done editing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chest Day', exact: true })).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0]);
  expect(after.ended_at).toBe(before.ended_at);
  expect(after.performed_on).toBe('2026-10-27');
  expect(after.workout_sets[1].reps).toBe(12);
});

test('custom discard supports focus, Escape, cancel and confirmed external navigation', async ({ page }, info) => {
  await page.getByLabel('Name', { exact: true }).fill('Unsaved Chest');
  await page.getByRole('button', { name: 'Community', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard changes?', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await page.screenshot({ path: info.outputPath('history-discard-confirmation.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Unsaved Chest');
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await page.getByRole('button', { name: 'Community', exact: true }).click();
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page).toHaveURL(/community/);
  await expect(dialog).toHaveCount(0);
});

test('custom delete keeps failures, prevents duplicates and cancels safely', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Delete workout', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete workout?', exact: true });
  await expect(dialog).toContainText('cannot be undone');
  await page.screenshot({ path: info.outputPath('history-delete-confirmation.png') });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Chest');
  await page.evaluate(() => {
    localStorage.setItem('qa-session-delete-fail', 'true');
    localStorage.setItem('qa-session-delete-delay', '300');
  });
  await page.getByRole('button', { name: 'Delete workout', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete workout', exact: true }).evaluate(button => { button.click(); button.click(); });
  await expect(dialog.getByRole('alert')).toContainText('not deleted');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workout-mutations')).filter(row => row.operation === 'session-delete').length)).toBe(1);
  await page.evaluate(() => localStorage.removeItem('qa-session-delete-fail'));
  await dialog.getByRole('button', { name: 'Delete workout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recent workouts' })).toBeVisible();
});
