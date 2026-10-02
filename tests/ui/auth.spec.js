import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    if (!localStorage.getItem('qa-auth-seeded')) {
      localStorage.setItem('qa-user', 'null');
      localStorage.setItem('qa-auth-seeded', 'true');
    }
  });
});

test('sign-in failure preserves credentials, locks the request and retries once', async ({ page }) => {
  await page.goto('/workout');
  await page.getByLabel('Email', { exact: true }).fill('qa@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.evaluate(() => {
    localStorage.setItem('qa-auth-fail', 'true');
    localStorage.setItem('qa-auth-delay', '750');
  });
  await page.getByRole('button', { name: 'Enter LifeOS' }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Password', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveText('Test sign-in failed. Try again.');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('qa@example.test');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('fixture-password');
  expect(await page.evaluate(() => localStorage.getItem('qa-auth-attempts'))).toBe('1');
  await page.evaluate(() => localStorage.removeItem('qa-auth-fail'));
  await page.getByRole('button', { name: 'Enter LifeOS' }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/workout$/);
  expect(await page.evaluate(() => localStorage.getItem('qa-auth-attempts'))).toBe('2');
});

test('account confirmation is announced without storing a logged-in session', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
  await page.getByLabel('Email', { exact: true }).fill('qa@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Check your email');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('qa@example.test');
  expect(await page.evaluate(() => localStorage.getItem('qa-user'))).toBe('null');
});

test('validation is announced and keyboard access reaches account switching', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter LifeOS' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email is required.');
  await page.getByLabel('Email', { exact: true }).fill('qa@example.test');
  await page.getByRole('button', { name: 'Enter LifeOS' }).click();
  await expect(page.getByRole('alert')).toHaveText('Password must be at least 6 characters.');
  await page.getByLabel('Email', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Enter LifeOS' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeFocused();
});

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932], [1280, 800], [1440, 900], [1920, 1080]]) {
  test(`private entry fits ${width}x${height}`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'LifeOS', exact: true })).toBeVisible();
    for (const label of ['Email', 'Password']) {
      const field = page.getByLabel(label, { exact: true });
      await expect(field).toBeVisible();
      expect((await field.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    for (const name of ['Enter LifeOS', 'Create account']) {
      const button = page.getByRole('button', { name, exact: true });
      expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('private-entry.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
}
