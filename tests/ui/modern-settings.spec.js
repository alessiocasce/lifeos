import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const evidence = 'docs/audits/lifeos-ui/screenshots';

test.beforeEach(async ({ page }) => {
  // WebKit routes same-origin blob: image decoding too; allow it, not external traffic.
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4178' ? route.continue() : route.abort());
  await page.route('**/tests/ui/fixtureApi.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + `
      userSettingsApi.saveProfile = async (profile, id) => {
        const previous = fixtureSettings(id);
        window.__settingsProfileWrites = (window.__settingsProfileWrites || 0) + 1;
        await new Promise(resolve => setTimeout(resolve, Number(localStorage.getItem('settings-delay') || 0)));
        if (localStorage.getItem('settings-profile-fail')) throw new Error('Profile could not be saved.');
        const next = { ...previous, profile: { ...previous.profile, username: profile.username } };
        localStorage.setItem('qa-settings:' + id, JSON.stringify(next)); return next.profile;
      };
      userSettingsApi.read = async id => {
        const next = fixtureSettings(id || user().id);
        await new Promise(resolve => setTimeout(resolve, Number(localStorage.getItem('settings-read-delay') || 0)));
        return next;
      };
      userSettingsApi.savePreferences = async (preferences, id) => {
        window.__settingsPreferenceWrites = (window.__settingsPreferenceWrites || 0) + 1;
        await new Promise(resolve => setTimeout(resolve, Number(localStorage.getItem('settings-delay') || 0)));
        if (localStorage.getItem('settings-preference-fail')) throw new Error('Preferences could not be saved.');
        const previous = fixtureSettings(id);
        const confirmed = { ...previous.preferences, ...preferences };
        localStorage.setItem('qa-settings:' + id, JSON.stringify({ ...previous, preferences: confirmed }));
        return confirmed;
      };
      profilePhotoApi.signedUrl = async profile => profile?.avatar_url || '/pwa-192x192.png';
      profilePhotoApi.upload = async (blob, id) => {
        if (localStorage.getItem('settings-photo-fail')) throw new Error('Upload failed. Try again.');
        const previous = fixtureSettings(id);
        const next = { ...previous, profile: { ...previous.profile, avatar_path: id + '/saved.webp', avatar_url: '/pwa-192x192.png' } };
        localStorage.setItem('qa-settings:' + id, JSON.stringify(next)); return next.profile;
      };
    ` });
  });
  await page.goto('/settings');
});

test('failed preference save rolls back and retries without losing a profile draft', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('draft_name');
  await page.evaluate(() => localStorage.setItem('settings-preference-fail', '1'));
  await page.getByLabel('Share set notes', { exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Preferences could not be saved.');
  await expect(page.getByLabel('Share set notes', { exact: true })).not.toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveValue('draft_name');
  await page.evaluate(() => localStorage.removeItem('settings-preference-fail'));
  await page.getByLabel('Share set notes', { exact: true }).check();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('qa-settings:qa-user-a'))?.preferences.share_workout_notes)).toBe(true);
});

test('profile failure retains lowercase input; repeated submit is locked', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('DRAFT_USER');
  await page.evaluate(() => { localStorage.setItem('settings-profile-fail', '1'); localStorage.setItem('settings-delay', '300'); });
  await page.getByRole('button', { name: 'Save profile', exact: true }).dblclick();
  await expect(page.getByRole('alert')).toHaveText('Profile could not be saved.');
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveValue('draft_user');
  expect(await page.evaluate(() => window.__settingsProfileWrites)).toBe(1);
});

test('account switching cannot apply an in-flight preference response to the new account', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('settings-delay', '450');
    localStorage.setItem('qa-settings:qa-user-b', JSON.stringify({ profile: { user_id: 'qa-user-b', username: 'member_b' }, preferences: { language: 'en', workout_sharing: true, share_workout_notes: false } }));
  });
  await page.getByLabel('Share completed workouts', { exact: true }).uncheck();
  await page.evaluate(() => window.__qaSignIn('qa-user-b'));
  await expect(page.getByText('@member_b', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Share completed workouts', { exact: true })).toBeChecked();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('qa-settings:qa-user-a'))?.preferences.workout_sharing)).toBe(false);
  await expect(page.getByText('@member_b', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Share completed workouts', { exact: true })).toBeChecked();
});

test('photo viewer is circular, closes with Escape and returns focus; information is discoverable', async ({ page }) => {
  await page.getByRole('button', { name: 'View profile photo', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Profile photo', exact: true });
  await expect(viewer).toBeVisible();
  const bounds = await viewer.locator('.settings-photo-circle').boundingBox();
  expect(Math.abs(bounds.width - bounds.height)).toBeLessThan(1);
  await expect(viewer.getByRole('button', { name: 'Edit profile photo', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View profile photo', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'About Share completed workouts', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('including past workouts');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
});

test('photo upload saves immediately; cancelling username edit never restores the old photo', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('unsaved_name');
  await page.getByRole('button', { name: 'Edit profile photo', exact: true }).click();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    canvas.getContext('2d').fillRect(0, 0, 64, 64);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page.getByLabel('Choose profile photo', { exact: true }).setInputFiles({ name: 'profile.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });
  await expect(page.getByRole('img', { name: 'Square crop preview', exact: true })).toBeVisible();
  await fs.mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/settings-photo-crop-390.png` });
  await page.getByRole('button', { name: 'Use photo', exact: true }).click();
  await expect(page.getByText('Photo saved.', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('@qa_user', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-settings:qa-user-a')).profile.avatar_path)).toBe('qa-user-a/saved.webp');
  await expect(page.getByRole('button', { name: 'View profile photo', exact: true }).locator('img')).toBeVisible();
});

test('signed-out auth starts in Italian and signup visibly normalizes usernames', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('qa-user', 'null'));
  await page.reload();
  await expect(page.getByLabel('Lingua', { exact: true })).toHaveValue('it');
  await expect(page.getByRole('heading', { name: 'Accedi', exact: true })).toBeVisible();
  await page.getByLabel('Lingua', { exact: true }).selectOption('en');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('FRESH_User');
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('fresh_user');
  await page.getByLabel('Language', { exact: true }).selectOption('it');
  await expect(page.getByLabel('Nome utente', { exact: true })).toHaveValue('fresh_user');
});

test('Settings, profile editing and circular viewer fit mobile and desktop viewports', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await fs.mkdir(evidence, { recursive: true });
  await page.evaluate(() => localStorage.setItem('qa-settings:qa-user-a', JSON.stringify({
    profile: { user_id: 'qa-user-a', username: 'qa_user', avatar_path: 'qa-user-a/saved.webp', avatar_url: '/pwa-192x192.png' },
    preferences: { language: 'it', workout_sharing: true, share_workout_notes: false },
  })));
  await page.reload();
  for (const [width, height] of [[375,812], [390,844], [430,932], [1024,900], [1440,900]]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('heading', { name: 'Profilo pubblico', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${evidence}/settings-normal-${width}.png` });
    await page.getByRole('button', { name: 'Visualizza foto profilo', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    if (width === 390) await page.screenshot({ path: `${evidence}/settings-photo-viewer-390.png` });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Modifica profilo', exact: true }).click();
    await expect(page.getByLabel('Nome utente', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) await page.screenshot({ path: `${evidence}/settings-edit-390.png` });
    await page.getByRole('button', { name: 'Annulla', exact: true }).click();
  }
  expect(errors).toEqual([]);
});

test('English is retained across reload; Italian change automatically persists', async ({ page }) => {
  await expect(page.getByLabel('Language', { exact: true })).toHaveValue('en');
  await page.getByLabel('Language', { exact: true }).selectOption('it');
  await expect(page.getByRole('heading', { name: 'Profilo pubblico', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Lingua', { exact: true })).toHaveValue('it');
  await page.getByLabel('Lingua', { exact: true }).selectOption('en');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Public profile', exact: true })).toBeVisible();
});

test('profile is read-only until explicitly edited and preferences save without a global action', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Public profile', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveCount(0);
  await expect(page.getByText('@qa_user', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toHaveCount(0);
  await expect(page.getByText('Application', { exact: true })).toHaveCount(0);
  await page.getByLabel('Share completed workouts', { exact: true }).uncheck();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('qa-settings:qa-user-a'))?.preferences.workout_sharing)).toBe(false);
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('My_NAME');
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveValue('my_name');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByText('@my_name', { exact: true })).toBeVisible();
});
