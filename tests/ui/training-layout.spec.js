import { test, expect } from '@playwright/test';

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932], [1280, 800], [1440, 900], [1920, 1080]]) {
  test(`Training layout and navigation at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/workout');
    await page.getByRole('textbox', { name: 'Exercise', exact: true }).fill('Barbell Curl');
    await page.getByRole('textbox', { name: /Weight/ }).fill('25');
    await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('8');
    await page.getByRole('textbox', { name: 'Reps', exact: true }).blur();
    await page.screenshot({ path: testInfo.outputPath('training.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const save = page.getByRole('button', { name: 'Save Set', exact: true });
    expect((await save.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await save.click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved: Barbell Curl' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: width < 768 ? 'Mobile navigation' : 'Primary navigation', exact: true });
    await nav.getByRole('button', { name: 'Command', exact: true }).click();
    await expect(page.getByRole('button', { name: /Training in progress.*Barbell Curl.*Resume/ })).toBeVisible();
    await page.getByRole('button', { name: /Training in progress.*Resume/ }).click();
    await expect(page.getByRole('textbox', { name: 'Exercise', exact: true })).toHaveValue('Barbell Curl');
    expect(errors).toEqual([]);
  });
}
