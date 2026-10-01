import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem('qa-projects', JSON.stringify([
    { id: '11111111-1111-4111-8111-111111111112', name: 'Release LifeOS', status: 'active', goal_type: 'tasks', current_value: 2, target_value: 8, unit_label: 'tasks', started_on: '2026-09-28', project_sessions: [] },
  ])));
});

test('project Watch grants are explicit and controls preserve typed lifecycle', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/projects');
  await page.getByRole('button', { name: /Release LifeOS/ }).click();
  const watch = page.getByRole('region', { name: 'LifeOS Watch' });
  await expect(watch.getByText('Off', { exact: true })).toBeVisible();
  await expect(watch.getByRole('button', { name: 'Enable Watch' })).toHaveCount(0);
  await watch.getByText('Companion permissions', { exact: true }).click();
  await watch.getByRole('checkbox', { name: /Allow project monitoring/ }).check();
  await watch.getByRole('button', { name: 'Enable Watch', exact: true }).click();
  await expect(watch.getByText('Watching', { exact: true })).toBeVisible();
  await expect(watch.getByRole('checkbox', { name: /Allow proactive messages/ })).not.toBeChecked();
  await watch.getByRole('button', { name: 'Suspend Watch' }).click();
  await expect(watch.getByText('Suspended', { exact: true })).toBeVisible();
  await watch.getByRole('button', { name: 'Resume Watch' }).click();
  await expect(watch.getByText('Watching', { exact: true })).toBeVisible();
  await watch.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('project-watch.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await watch.getByRole('button', { name: 'Retire Watch', exact: true }).click();
  await expect(watch.getByText('Watching', { exact: true })).toBeVisible();
  await watch.getByRole('button', { name: 'Confirm retirement' }).click();
  await expect(watch.getByText('Retired', { exact: true })).toBeVisible();
  await expect(watch.getByRole('button', { name: /Enable Watch|Resume Watch/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('failed Watch save does not display a false enabled state', async ({ page }) => {
  await page.goto('/projects');
  await page.getByRole('button', { name: /Release LifeOS/ }).click();
  const watch = page.getByRole('region', { name: 'LifeOS Watch' });
  await watch.getByText('Companion permissions', { exact: true }).click();
  await watch.getByRole('checkbox', { name: /Allow project monitoring/ }).check();
  await page.evaluate(() => localStorage.setItem('qa-watch-fail', 'true'));
  await watch.getByRole('button', { name: 'Enable Watch', exact: true }).click();
  await expect(watch.getByRole('alert')).toContainText('Watch was not saved.');
  await expect(watch.getByText('Off', { exact: true })).toBeVisible();
});
