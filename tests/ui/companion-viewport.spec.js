import { test, expect } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });

test('Companion restores the dock when keyboard recovery sends no final viewport event', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/assistant');
  const dock = page.getByRole('navigation', { name: 'Mobile navigation' });
  const input = page.getByTestId('brain-message-input');
  await expect(dock).toBeVisible();
  const idleDock = await dock.boundingBox();
  await input.fill('Keep this draft');
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 440 });
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect(dock).toBeHidden();
  await input.blur();
  await expect(dock).toBeHidden();
  await page.evaluate(() => delete visualViewport.height);
  await expect(dock).toBeVisible({ timeout: 1500 });
  expect(await dock.boundingBox()).toEqual(idleDock);
  await expect(page.locator('.companion-toolbar')).toBeVisible();
  await expect(page.locator('.lifeos-shell .workspace')).toHaveCSS('position', 'static');
  await expect(input).toHaveValue('Keep this draft');
});

test('Companion keeps its document height through keyboard animation', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/assistant');
  const shell = page.locator('.lifeos-shell');
  const workspace = shell.locator('.workspace');
  const input = page.getByTestId('brain-message-input');
  await expect(input).toHaveAttribute('inputmode', 'text');
  await expect(input).toHaveAttribute('enterkeyhint', 'send');
  const documentHeight = (await shell.boundingBox()).height;
  const closedHeight = (await workspace.boundingBox()).height;
  await expect(workspace).toHaveCSS('position', 'static');
  const initialComposerHeight = (await page.locator('.companion-composer').boundingBox()).height;
  await input.tap();
  for (const [height, top] of [[800, 0], [740, 10], [680, 30], [560, 50], [440, 60], [560, 40], [740, 10], [844, 0]]) {
    await page.evaluate(({ height, top }) => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, value: height });
      Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: top });
      visualViewport.dispatchEvent(new Event('resize'));
      visualViewport.dispatchEvent(new Event('scroll'));
    }, { height, top });
    expect((await shell.boundingBox()).height).toBe(documentHeight);
    await expect.poll(async () => (await workspace.boundingBox()).height).toBeCloseTo(Math.min(height, closedHeight), 1);
    if (height < 724) await expect(page.locator('.companion-toolbar')).toBeHidden();
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
