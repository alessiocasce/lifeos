import { test, expect } from '@playwright/test';

test('failed lazy workspace keeps navigation available and does not clear drafts', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/src/tabs/MemosTab.jsx*', route => route.fulfill({ contentType: 'application/javascript', body: 'throw new Error("QA module failure");' }));
  await page.addInitScript(() => localStorage.setItem('qa-recovery-sentinel', 'keep'));
  await page.goto('/memos');
  await expect(page.getByRole('heading', { name: 'This workspace could not be opened.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Command', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Command', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('qa-recovery-sentinel'))).toBe('keep');
});
