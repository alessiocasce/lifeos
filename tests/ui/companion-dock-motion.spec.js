import { test, expect } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('the rendered dock sits lower and at identical coordinates across mobile tabs', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.documentElement.style.setProperty('--lifeos-safe-bottom', '34px'));
  const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
  const positions = [];
  for (const name of ['Command', 'Companion', 'Community', 'Training', 'Companion', 'Command']) {
    await nav.getByRole('button', { name, exact: true }).tap();
    await expect(nav).toBeVisible();
    const box = await nav.boundingBox();
    positions.push({ y: box.y, bottom: box.y + box.height, height: box.height });
  }
  expect(positions.every(position => position.y === positions[0].y && position.height === positions[0].height)).toBe(true);
  expect(positions[0].bottom).toBe(844 - 22);
  await nav.getByRole('button', { name: 'Companion', exact: true }).tap();
  await page.getByTestId('brain-message-input').fill('Cycle the keyboard');
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 360 });
    visualViewport.dispatchEvent(new Event('resize'));
    document.querySelector('.companion-input').blur();
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 844 });
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect(nav).toBeVisible();
  const returned = await nav.boundingBox();
  expect(returned.y).toBe(positions[0].y);
});

test('Companion cannot pan its document or translate a pull-refresh ancestor on focus', async ({ page }) => {
  await page.goto('/assistant');
  await expect(page.getByTestId('brain-message-input')).toBeVisible();
  const body = await page.locator('body').evaluate(el => ({ position: getComputedStyle(el).position, height: el.getBoundingClientRect().height }));
  expect(body.position).toBe('fixed');
  expect(body.height).toBe(844);
  await expect(page.locator('.pull-refresh')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 200));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('composer follows native viewport recovery without a second up-down motion', async ({ page }) => {
  await page.goto('/assistant');
  const input = page.getByTestId('brain-message-input');
  await input.fill('Keep this draft');
  const original = await page.locator('.companion-composer').boundingBox();
  const samples = await page.evaluate(async () => {
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const setViewport = async (height, top) => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, value: height });
      Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: top });
      visualViewport.dispatchEvent(new Event('resize')); visualViewport.dispatchEvent(new Event('scroll'));
      await frame();
      const box = document.querySelector('.companion-composer').getBoundingClientRect();
      return { height, top, bottom: box.bottom - top };
    };
    const opening = [];
    for (const [height, top] of [[760, 0], [600, 30], [420, 60], [360, 60]]) opening.push(await setViewport(height, top));
    document.querySelector('.companion-input').blur();
    const values = [];
    for (const [height, top] of [[420, 40], [540, 20], [680, 0], [844, 0]]) values.push(await setViewport(height, top));
    return { opening, closing: values };
  });
  for (const sample of samples.opening) expect(sample.bottom).toBeCloseTo(Math.min(sample.height - 4, original.y + original.height), 0);
  for (const sample of samples.closing.slice(0, 3)) expect(sample.bottom).toBeCloseTo(sample.height - 4, 0);
  expect(samples.closing.at(-1).bottom).toBeCloseTo(original.y + original.height, 0);
  await expect(input).toHaveValue('Keep this draft');
});
