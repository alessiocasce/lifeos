import { test, expect } from '@playwright/test';

test('expired recovery return offers another reset without exposing URL error details', async ({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(()=>localStorage.setItem('qa-user','null'));
  await page.goto('/#error=access_denied&error_code=otp_expired&error_description=private-detail');
  await page.getByLabel('Lingua',{exact:true}).selectOption('en');
  await expect(page.getByRole('alert')).toContainText('This reset link is invalid or expired');
  await expect(page.getByRole('alert')).not.toContainText('private-detail');
  await page.getByRole('button',{name:'Forgot password?',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Reset password',exact:true})).toBeVisible();
});

test('password reset request is explicit, generic and supports safe retry', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem('qa-user', 'null'));
  await page.goto('/');
  await page.getByLabel('Lingua', { exact: true }).selectOption('en');
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('qa@example.test');
  await page.getByRole('button', { name: 'Send reset link', exact: true }).dblclick();
  await expect(page.getByRole('status')).toContainText('If an account exists');
  expect(await page.evaluate(() => Number(localStorage.getItem('qa-reset-requests')))).toBe(1);
});

test('validated recovery session shows password update and preserves input on failure', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Command', exact: true })).toBeVisible();
  await page.evaluate(() => { localStorage.setItem('qa-reset-fail', '1'); window.__qaPasswordRecovery(); });
  await page.getByLabel('New password', { exact: true }).fill('qa-new-password');
  await page.getByLabel('Confirm password', { exact: true }).fill('qa-new-password');
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Password update failed');
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('qa-new-password');
  await page.evaluate(() => localStorage.removeItem('qa-reset-fail'));
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Command', exact: true })).toBeVisible();
});
