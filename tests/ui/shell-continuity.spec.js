import { test, expect } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

const exercise = (page) => page.getByRole('textbox', { name: 'Exercise', exact: true });
const dock = (page) => page.getByRole('navigation', { name: 'Mobile navigation' });

test('keyboard focus after viewport resize hides dock, blur restores it', async ({ page }) => {
  await page.goto('/workout');
  await expect(exercise(page)).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: innerHeight - 300 });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect(dock(page)).toBeVisible();
  await exercise(page).focus();
  await expect(dock(page)).toBeHidden();
  await page.evaluate(() => document.activeElement.blur());
  await expect(dock(page)).toBeVisible();
});

test('keyboard resize with focused input preserves draft and dock returns on dismissal', async ({ page }) => {
  await page.goto('/workout');
  await exercise(page).fill('Barbell Curl');
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: innerHeight - 300 });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect(dock(page)).toBeHidden();
  await expect(exercise(page)).toHaveValue('Barbell Curl');
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: innerHeight });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect(dock(page)).toBeVisible();
});

test('reconnection refresh retains visible draft and browser back retains user agency', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/workout');
  await exercise(page).fill('Barbell Curl');
  await page.getByRole('textbox', { name: /Weight/ }).fill('25');
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('8');
  await page.evaluate(() => {
    localStorage.setItem('qa-load-delay', '1000');
    window.dispatchEvent(new Event('online'));
    window.__qaAuthRefresh();
  });
  await expect(exercise(page)).toHaveValue('Barbell Curl');
  await expect(page.getByRole('textbox', { name: 'Reps', exact: true })).toHaveValue('8');
  await page.waitForTimeout(1200);
  await expect(exercise(page)).toHaveValue('Barbell Curl');
  await dock(page).getByRole('button', { name: 'Command', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/workout$/);
  await expect(exercise(page)).toHaveValue('Barbell Curl');
  await page.goForward();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: /Training in progress/ }).click();
  await expect(exercise(page)).toHaveValue('Barbell Curl');
  expect(errors).toEqual([]);
});

test('pull refresh defers waiting PWA activation even with an empty live logger', async ({ page }) => {
  await page.goto('/workout');
  await expect(exercise(page)).toHaveValue('');
  await page.evaluate(() => {
    window.__qaActivationCount = 0;
    // Emulate the browser service-worker boundary, not the update implementation.
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      getRegistration: async () => ({ waiting: { postMessage() { window.__qaActivationCount += 1; } } }),
    } });
    window.scrollTo(0, 0);
    const container = document.querySelector('.workspace-content').parentElement.parentElement;
    const target = document.querySelector('.workspace-content');
    target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [new Touch({ identifier: 1, target, clientX: 80, clientY: 30 })] }));
    container.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [new Touch({ identifier: 1, target, clientX: 80, clientY: 200 })] }));
    container.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] }));
  });
  await expect(page.getByText('Update ready - finish your workout first.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__qaActivationCount)).toBe(0);
  await expect(exercise(page)).toHaveValue('');
  await expect(page).toHaveURL(/\/workout$/);
});
