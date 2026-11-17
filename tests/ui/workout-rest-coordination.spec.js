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

for (const mode of ['fail', 'lost', 'readback-fail']) {
  test(`notification ${mode} retains failure and registration until explicit retry`, async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(() => {
      localStorage.setItem('qa-user', JSON.stringify({ id: 'qa-user-a' }));
      localStorage.setItem('qa-settings:qa-user-a', JSON.stringify({ profile: { user_id: 'qa-user-a', username: 'alpha' }, preferences: { language: 'en' } }));
      localStorage.setItem('qa-rest:qa-user-a', JSON.stringify({ preference: { enabled: true, seconds: 120, notifications: false }, timer: { id: 'timer-a', workout_id: 'qa-session-a', scheduled_for: new Date(Date.now() + 120000).toISOString() } }));
    });
    await page.goto('/workout');
    await page.getByRole('button', { name: 'Rest timer', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Rest timer', exact: true });
    const toggle = sheet.getByRole('switch', { name: 'Background notifications' });
    await expect(toggle).toBeEnabled();
    await page.evaluate(async mode => {
      const { workoutRestApi: adapter } = await import('/tests/ui/fixtureRestApi.js');
      window.__qaRestCalls = { read: 0, save: 0, enableNotifications: 0 };
      for (const method of Object.keys(window.__qaRestCalls)) {
        const original = adapter[method];
        adapter[method] = (...args) => { window.__qaRestCalls[method]++; return original(...args); };
      }
      localStorage.setItem(mode === 'lost' ? 'qa-rest-response-lost' : 'qa-rest-fail', 'yes');
      if (mode === 'readback-fail') localStorage.setItem('qa-rest-read-fail', 'yes');
    }, mode);
    await toggle.click();
    await expect(sheet.getByRole('alert').filter({ hasText: 'Notification settings could not be saved.' })).toBeVisible();
    await expect(toggle).toBeEnabled();
    await expect(toggle).toBeChecked({ checked: mode === 'lost' });
    expect(await page.evaluate(() => window.__qaRestCalls)).toEqual({ read: 1, save: 1, enableNotifications: 1 });
    expect(await page.evaluate(() => localStorage.getItem('qa-push-device'))).toBe('ready');
    await expect(sheet.getByRole('timer')).toBeVisible();
    if (mode === 'readback-fail') {
      await expect(sheet.getByRole('alert')).toHaveCount(2);
      for (const width of [360, 390, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(sheet.getByRole('alert').first()).toBeVisible();
        await expect(sheet.getByRole('alert').last()).toBeVisible();
        const bounds = await sheet.boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
        expect(await sheet.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        if (width === 360) await page.screenshot({ path: test.info().outputPath('rest-dual-errors-360.png') });
        await toggle.scrollIntoViewIfNeeded();
        await expect(toggle).toBeInViewport();
        await expect(toggle).toBeEnabled();
      }
    }
    await page.evaluate(() => {
      localStorage.removeItem('qa-rest-fail'); localStorage.removeItem('qa-rest-response-lost'); localStorage.removeItem('qa-rest-read-fail');
      window.dispatchEvent(new Event('focus'));
    });
    await expect.poll(() => page.evaluate(() => window.__qaRestCalls.read)).toBe(2);
    await expect(sheet.getByRole('alert')).toHaveCount(1);
    if (mode === 'lost') await sheet.getByRole('button', { name: 'Reconnect notifications' }).click();
    else await toggle.click();
    await expect(sheet.getByRole('alert')).toHaveCount(0);
    await expect(toggle).toBeChecked();
    expect(await page.evaluate(() => window.__qaRestCalls)).toEqual({ read: 2, save: 2, enableNotifications: 2 });
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(sheet.getByRole('switch', { name: 'Automatic rest timer' })).toBeChecked();
    await expect(sheet.getByRole('timer')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('qa-push-device'))).toBe('ready');
    expect(await page.evaluate(() => window.__qaRestCalls)).toEqual({ read: 2, save: 3, enableNotifications: 2 });
  });
}
