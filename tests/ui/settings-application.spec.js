import { test, expect } from '@playwright/test';

test('installed build and guarded update controls are available in collapsed Settings Application', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/settings');
  const details = page.locator('.settings-application');
  await expect(details.locator('code')).toBeHidden();
  await details.locator('summary').click();
  await expect(details.locator('code')).toHaveText(/^(development|[a-f0-9]{7,40})$/);
  await expect(details.getByRole('button', { name: 'Check for updates', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
