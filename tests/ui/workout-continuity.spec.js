import { test, expect } from '@playwright/test';

const exercise = (page) => page.getByRole('textbox', { name: 'Exercise', exact: true });
const weight = (page) => page.getByRole('textbox', { name: /Weight/ });
const reps = (page) => page.getByRole('textbox', { name: 'Reps', exact: true });

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

async function fillDraft(page) {
  await page.goto('/workout');
  await exercise(page).fill('Barbell Curl');
  await weight(page).fill('25');
  await reps(page).fill('8');
}

test('unsaved full draft and exercise switch survive reload', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await fillDraft(page);
  await page.getByText('RPE & notes', { exact: true }).click();
  await page.getByRole('textbox', { name: 'RPE optional' }).fill('8');
  await page.getByRole('textbox', { name: 'Notes optional' }).fill('Controlled eccentric');
  await page.screenshot({ path: testInfo.outputPath('training-mobile.png'), fullPage: true });
  await page.getByRole('checkbox', { name: 'Warmup set' }).check();
  await page.reload();
  await expect(exercise(page)).toHaveValue('Barbell Curl');
  await expect(weight(page)).toHaveValue('25');
  await expect(reps(page)).toHaveValue('8');
  await expect(page.getByRole('textbox', { name: 'RPE optional' })).toHaveValue('8');
  await expect(page.getByRole('textbox', { name: 'Notes optional' })).toHaveValue('Controlled eccentric');
  await expect(page.getByRole('button', { name: 'Save Warmup', exact: true })).toBeVisible();
  await exercise(page).fill('Dumbbell Curl');
  await page.reload();
  await expect(exercise(page)).toHaveValue('Dumbbell Curl');
  expect(errors).toEqual([]);
});

test('confirmed save preserves exercise and load, advances set, and survives root relaunch', async ({ page }) => {
  await fillDraft(page);
  await page.getByRole('button', { name: 'Save Set', exact: true }).click();
  await expect(reps(page)).toHaveValue('8');
  await page.goto('/');
  await expect(page).toHaveURL(/\/workout$/);
  await expect(exercise(page)).toHaveValue('Barbell Curl');
  await expect(weight(page)).toHaveValue('25');
  await expect(page.getByText('Set 2', { exact: true })).toBeVisible();
  const sets = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets);
  expect(sets).toHaveLength(1);
});

test('failed mutation keeps draft through reload and never pretends it saved', async ({ page }) => {
  await fillDraft(page);
  await page.evaluate(() => localStorage.setItem('qa-fail-save', 'true'));
  await page.getByRole('button', { name: 'Save Set', exact: true }).click();
  await expect(page.getByText('Test connection lost. Set not saved.')).toBeVisible();
  await expect(reps(page)).toHaveValue('8');
  await page.reload();
  await expect(reps(page)).toHaveValue('8');
  await expect(exercise(page)).toHaveValue('Barbell Curl');
});

test('saved sets remain editable, deletable and session can reopen', async ({ page }) => {
  await fillDraft(page);
  await page.getByRole('button', { name: 'Save Set', exact: true }).click();
  await expect(reps(page)).toHaveValue('8');
  await page.getByRole('button', { name: 'Edit set', exact: true }).click();
  const editor = page.getByRole('group', { name: 'Edit workout set' });
  await editor.getByRole('textbox', { name: 'Reps', exact: true }).fill('10');
  await editor.getByRole('button', { name: 'Save edit', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets[0].reps)).toBe(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'End Workout', exact: true }).click();
  await page.getByRole('button', { name: 'Reopen', exact: true }).click();
  await expect(exercise(page)).toBeVisible();
  await page.getByRole('button', { name: 'Delete set', exact: true }).click();
  await expect(page.getByText('No sets logged in this session.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets)).toEqual([]);
});

test('confirmed end clears draft and new session starts clean', async ({ page }) => {
  await fillDraft(page);
  await page.getByRole('button', { name: 'End Workout', exact: true }).click();
  await expect(page.getByText('This workout is ended. Reopen it to add more sets.')).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes(':draft:')))).toEqual([]);
  await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('qa-workouts'));
    rows.unshift({ ...rows[0], id: 'qa-session-new', name: 'New session', ended_at: null, workout_sets: [] });
    localStorage.setItem('qa-workouts', JSON.stringify(rows));
  });
  await page.reload();
  await expect(exercise(page)).toHaveValue('');
  await expect(weight(page)).toHaveValue('');
});

test('sign-out removes only the current user draft and another user cannot inherit it', async ({ page }) => {
  await fillDraft(page);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: /Sign out/ }).click();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('lifeos:training:')))).toEqual([]);
  await page.evaluate(() => window.__qaSignIn('qa-user-b'));
  await expect(exercise(page)).toHaveCount(0);
});

test('intentional Home navigation and direct routes win; auth refresh preserves fields', async ({ page }) => {
  await fillDraft(page);
  await page.evaluate(() => window.__qaAuthRefresh());
  await expect(reps(page)).toHaveValue('8');
  await page.getByRole('button', { name: 'Command', exact: true }).last().click();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/health');
  await expect(page).toHaveURL(/\/health$/);
  await page.goto('/workout');
  await expect(exercise(page)).toHaveValue('Barbell Curl');
});

test('session switching isolates fields and restores selected session ahead of newer rows', async ({ page }) => {
  await fillDraft(page);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lifeos:training:v1:qa-user-a:workspace'));
    localStorage.setItem('qa-workouts', JSON.stringify([
      { id: 'other', user_id: 'qa-user-a', name: 'Other workout', performed_on: '2026-09-28', ended_at: null, workout_sets: [] },
      { id: saved.sessionId, user_id: 'qa-user-a', name: 'Pull session', performed_on: '2026-09-28', ended_at: null, workout_sets: [] },
    ]));
  });
  await page.reload();
  await expect(exercise(page)).toHaveValue('Barbell Curl');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /Other workout/ }).click();
  await page.getByText('Session actions', { exact: true }).click();
  await page.getByRole('button', { name: 'Select for logging', exact: true }).click();
  await expect(exercise(page)).toHaveValue('');
  await exercise(page).fill('Squat');
  await page.reload();
  await expect(exercise(page)).toHaveValue('Squat');
});

test('deleted saved session does not restore stale draft or redirect root', async ({ page }) => {
  await fillDraft(page);
  await page.evaluate(() => localStorage.setItem('qa-workouts', '[]'));
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/workout');
  await expect(exercise(page)).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes(':draft:')))).toEqual([]);
});

test('navigation during initial session loading is never overridden', async ({ page }) => {
  await fillDraft(page);
  await page.evaluate(() => localStorage.setItem('qa-load-delay', '1000'));
  await page.goto('/');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: 'Health', exact: true }).last().click();
  await expect(page).toHaveURL(/\/health$/);
  await page.waitForTimeout(1200);
  await expect(page).toHaveURL(/\/health$/);
});
