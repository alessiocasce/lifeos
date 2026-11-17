import { test, expect } from '@playwright/test';

test('returning to the same account cannot persist a notification action from its previous lifetime', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('qa-user', JSON.stringify({ id: 'qa-user-a' }));
    localStorage.setItem('qa-settings:qa-user-a', JSON.stringify({ profile: { user_id: 'qa-user-a', username: 'alpha' }, preferences: { language: 'en' } }));
  });
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Rest timer', exact: true }).click();
  await page.evaluate(async () => {
    const { workoutRestApi: adapter } = await import('/tests/ui/fixtureRestApi.js');
    const original = adapter.enableNotifications;
    adapter.enableNotifications = async (...args) => {
      window.__qaRestStarted = true;
      await new Promise(resolve => { window.__qaRestRelease = resolve; });
      return original(...args);
    };
  });
  await page.getByRole('switch', { name: 'Background notifications', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__qaRestStarted))).toBe(true);
  await page.evaluate(() => window.__qaSignIn('qa-user-b'));
  await expect(page.getByRole('button', { name: 'Rest timer', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.__qaSignIn('qa-user-a'));
  await page.getByRole('button', { name: 'Rest timer', exact: true }).click();
  await page.evaluate(() => window.__qaRestRelease());
  await expect(page.getByRole('switch', { name: 'Background notifications', exact: true })).not.toBeChecked();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-rest:qa-user-a') || '{"preference":{"notifications":false}}').preference.notifications)).toBe(false);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
