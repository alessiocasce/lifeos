import { test, expect } from '@playwright/test';

test('initial unknown preferences stay neutral until the first read confirms them', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('qa-user', JSON.stringify({ id: 'qa-user-a' }));
    localStorage.setItem('qa-settings:qa-user-a', JSON.stringify({ profile: { user_id: 'qa-user-a', username: 'alpha' }, preferences: { language: 'en' } }));
  });
  await page.route('**/tests/ui/fixtureRestApi.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nconst initialRead = workoutRestApi.read;\nworkoutRestApi.read = async (...args) => { await new Promise(resolve => { window.__qaReleaseInitial = resolve; }); return initialRead(...args); };` });
  });
  await page.goto('/workout');
  const trigger = page.getByRole('button', { name: 'Rest timer', exact: true });
  await expect(trigger).toHaveText('—');
  await trigger.click();
  await expect(page.getByRole('switch', { name: 'Automatic rest timer' })).toHaveCount(0);
  await page.evaluate(() => window.__qaReleaseInitial());
  await expect(trigger).toHaveText('Off');
  await expect(page.getByRole('switch', { name: 'Automatic rest timer' })).not.toBeChecked();
});

test('saved-set and resume events during a preference change share one readback and keep controls busy', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('qa-user', JSON.stringify({ id: 'qa-user-a' }));
    localStorage.setItem('qa-settings:qa-user-a', JSON.stringify({ profile: { user_id: 'qa-user-a', username: 'alpha' }, preferences: { language: 'en' } }));
    localStorage.setItem('qa-rest:qa-user-a', JSON.stringify({ preference: { enabled: true, seconds: 120, notifications: false }, timer: null }));
  });
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Rest timer', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Rest timer', exact: true });
  const duration = sheet.getByRole('combobox', { name: 'Default duration', exact: true });
  await expect(duration).toHaveValue('120');
  await page.evaluate(async () => {
    const { workoutRestApi: adapter } = await import('/tests/ui/fixtureRestApi.js');
    const save = adapter.save, read = adapter.read;
    window.__qaReads = 0;
    adapter.save = async (...args) => {
      window.__qaSaving = true;
      await new Promise(resolve => { window.__qaReleaseSave = resolve; });
      return save(...args);
    };
    adapter.read = async (...args) => {
      window.__qaReads++;
      await new Promise(resolve => { window.__qaReleaseRead = resolve; });
      return read(...args);
    };
  });
  await duration.selectOption('90');
  await expect.poll(() => page.evaluate(() => Boolean(window.__qaSaving))).toBe(true);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('lifeos:workout-set-saved', { detail: { userId: 'qa-user-a', sessionId: 'qa-session-a' } }));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    window.__qaReleaseSave();
  });
  await expect.poll(() => page.evaluate(() => window.__qaReads)).toBe(1);
  await expect(duration).toBeDisabled();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    window.__qaReleaseRead();
  });
  await expect(sheet.getByRole('timer')).toBeVisible();
  await expect(duration).toBeEnabled();
  await expect(duration).toHaveValue('90');
  expect(await page.evaluate(() => window.__qaReads)).toBe(1);
});
