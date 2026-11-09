import { test, expect } from '@playwright/test';

test('Command, Companion and Projects retain task hierarchy across review viewports', async ({ page }) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  for (const width of [375,390,430,1024,1440]) {
    await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
    for (const [path, title] of [['/','Command'], ['/assistant','Companion'], ['/projects','Projects']]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: title, exact: true }).first()).toBeVisible();
      if (path === '/assistant') await page.getByTestId('brain-message-input').fill('Help me prepare my next training session.');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `docs/audits/lifeos-ui/screenshots/${title.toLowerCase()}-${width}.png` });
    }
  }
  expect(errors).toEqual([]);
});
