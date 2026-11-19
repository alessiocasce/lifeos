import { test, expect } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });
test('Companion keeps one layout through keyboard animation instead of switching modes', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/assistant');
  const shell = page.locator('.lifeos-shell');
  const input = page.getByTestId('brain-message-input');
  await expect(input).toHaveAttribute('inputmode', 'text');
  await expect(input).toHaveAttribute('enterkeyhint', 'send');
  expect(await shell.evaluate(el => getComputedStyle(el).position)).toBe('fixed');
  const toolbarY = (await page.locator('.companion-toolbar').boundingBox()).y;
  const initialComposerHeight = (await page.locator('.companion-composer').boundingBox()).height;
  await input.tap();
  for (const [height, top] of [[800, 0], [740, 10], [680, 30], [560, 50], [440, 60], [560, 40], [740, 10], [844, 0]]) {
    await page.evaluate(({ height, top }) => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, value: height });
      Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: top });
      visualViewport.dispatchEvent(new Event('resize'));
      visualViewport.dispatchEvent(new Event('scroll'));
    }, { height, top });
    await expect.poll(async () => (await shell.boundingBox()).height).toBe(height);
    expect(await shell.evaluate(el => getComputedStyle(el).position)).toBe('fixed');
    expect((await page.locator('.companion-toolbar').boundingBox()).y - top).toBeCloseTo(toolbarY, 0);
    const composer = await page.locator('.companion-composer').boundingBox();
    expect(composer.height).toBeCloseTo(initialComposerHeight, 0);
    expect(composer.y + composer.height).toBeLessThanOrEqual(top + height);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  }
  await input.fill('First line\nSecond line\nThird line');
  await expect(input).toHaveValue('First line\nSecond line\nThird line');
  await input.blur();
  await expect(page.locator('.mobile-dock')).toBeVisible();
});
