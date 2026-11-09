import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('reopening detects missing subscription and offers explicit reconnect without changing global opt-in',async({page})=>{
  await page.addInitScript(()=>{localStorage.setItem('qa-rest:qa-user-a',JSON.stringify({preference:{enabled:true,seconds:60,notifications:true},timer:null}));localStorage.setItem('qa-push-device','reconnect');});
  await page.goto('/workout');
  await page.getByRole('button',{name:'Rest timer',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Rest timer',exact:true});
  await expect(sheet.getByRole('switch',{name:'Background notifications',exact:true})).not.toBeChecked();
  await expect(sheet.getByRole('status')).toContainText('reconnecting');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-rest:qa-user-a')).preference.notifications)).toBe(true);
  await sheet.getByRole('button',{name:'Reconnect notifications',exact:true}).click();
  await expect(sheet.getByRole('switch',{name:'Background notifications',exact:true})).toBeChecked();
  await expect(sheet.getByRole('status')).toContainText('registered');
  await page.evaluate(()=>{localStorage.setItem('qa-rest-read-fail','1');window.dispatchEvent(new Event('focus'));});
  await expect(sheet.getByRole('switch',{name:'Background notifications',exact:true})).not.toBeChecked();
  await expect(sheet.getByRole('status')).toContainText('could not be verified');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-rest:qa-user-a')).preference.notifications)).toBe(true);
});

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('qa-user', JSON.stringify({ id: 'qa-user-a', email: 'qa@example.test' }));
    localStorage.setItem('qa-settings:qa-user-a', JSON.stringify({ profile: { user_id: 'qa-user-a', username: 'alpha' }, preferences: { language: 'en', workout_sharing: true, share_workout_notes: false } }));
  });
});

test('rest preferences persist, duration is bounded and notification failures do not enable notifications', async ({ page }, info) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Rest timer', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Rest timer' });
  const enabled = sheet.getByRole('switch', { name: 'Automatic rest timer' });
  await expect(enabled).not.toBeChecked();
  await enabled.check();
  await sheet.getByRole('combobox', { name: 'Default duration' }).selectOption('60');
  await page.evaluate(() => localStorage.setItem('qa-push-fail', '1'));
  await sheet.getByRole('switch', { name: 'Background notifications' }).click();
  await expect(sheet.getByRole('alert')).toContainText('permission');
  await expect(sheet.getByRole('switch', { name: 'Background notifications' })).not.toBeChecked();
  await page.screenshot({ path: info.outputPath('rest-settings-390.png') });
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Rest timer', exact: true })).toContainText('1:00');
});

test('successful set event starts absolute countdown, resume reconciles and cancel removes it', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Rest timer', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Rest timer' });
  await sheet.getByRole('switch', { name: 'Automatic rest timer' }).check();
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('lifeos:workout-set-saved', { detail: { userId: 'qa-user-a', sessionId: 'qa-session-a' } })));
  await page.getByRole('button', { name: 'Rest timer', exact: true }).click();
  await expect(sheet.getByRole('timer')).toContainText(/1:5\d|2:00/);
  await page.reload();
  await page.getByRole('button', { name: 'Rest timer', exact: true }).click();
  await expect(sheet.getByRole('timer')).toBeVisible();
  await sheet.getByRole('button', { name: 'Cancel timer' }).click();
  await expect(sheet.getByRole('timer')).toHaveCount(0);
});

test('failed set persistence never starts rest, saved warmup does and End Workout cancels it', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Rest timer', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Rest timer' });
  await sheet.getByRole('switch', { name: 'Automatic rest timer' }).check();
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  const logger = page.getByRole('region', { name: 'Workout set logger' });
  await logger.getByRole('button', { name: 'Exercise', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Barbell Bench Press', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await logger.getByLabel('Total load (kg)', { exact: true }).fill('40');
  await logger.getByLabel('Reps', { exact: true }).fill('10');
  await logger.getByRole('checkbox', { name: 'Warmup set' }).check();
  await page.evaluate(() => localStorage.setItem('qa-fail-save', 'true'));
  await logger.getByRole('button', { name: 'Save Set', exact: true }).click();
  await expect(logger.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-rest:qa-user-a')).timer)).toBeNull();
  await page.evaluate(() => localStorage.removeItem('qa-fail-save'));
  await logger.getByRole('button', { name: 'Save Set', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('qa-rest:qa-user-a')).timer?.workout_id)).toBe('qa-session-a');
  await page.getByRole('button', { name: 'End Workout', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Completed workout', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rest timer', exact: true })).toHaveCount(0);
});

test('countdown states and floating settings fit mobile widths', async ({ page }) => {
  await fs.mkdir('docs/audits/lifeos-ui/screenshots', { recursive: true });
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/workout');
    for (const [seconds, tone] of [[100, 'normal'], [40, 'warning'], [8, 'urgent']]) {
      await page.evaluate(seconds => localStorage.setItem('qa-rest:qa-user-a', JSON.stringify({ preference: { enabled: true, seconds: 120, notifications: false },
        timer: { id: 'qa-rest', workout_id: 'qa-session-a', scheduled_for: new Date(Date.now()+seconds*1000).toISOString(), state: 'queued' } })), seconds);
      await page.reload();
      await expect(page.getByRole('button', { name: 'Rest timer', exact: true })).toHaveAttribute('data-tone', tone);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 390) await page.screenshot({ path: `docs/audits/lifeos-ui/screenshots/timer-${tone}-390.png` });
    }
    await page.getByRole('button', { name: 'Rest timer', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Rest timer' });
    await sheet.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
    const rect = await sheet.boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    expect(rect.y + rect.height).toBeLessThan(844);
    await page.screenshot({ path: `docs/audits/lifeos-ui/screenshots/timer-settings-${width}.png` });
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toHaveCount(0);
  }
});
