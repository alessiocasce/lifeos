import { test, expect } from '@playwright/test';
import { profilePhotoCrop } from '../../src/utils/profilePhoto.js';

test('real JPEG, PNG and WebP bytes decode despite missing or misleading MIME; JPEG fallback works', async ({ page }) => {
  for (const type of ['image/jpeg','image/png','image/webp']) {
    const bytes=await page.evaluate(async type=>{const c=document.createElement('canvas');c.width=64;c.height=48;const ctx=c.getContext('2d');ctx.fillStyle='#3d9b70';ctx.fillRect(0,0,64,48);const blob=await new Promise(r=>c.toBlob(r,type));return [...new Uint8Array(await blob.arrayBuffer())];},type);
    await page.getByLabel('Choose profile photo',{exact:true}).setInputFiles({name:'misreported.bin',mimeType:'application/octet-stream',buffer:Buffer.from(bytes)});
    await expect(page.getByRole('img',{name:'Square crop preview'})).toBeVisible();
    if(type==='image/webp') await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback,type,...rest){if(type==='image/webp')callback(null);else original.call(this,callback,type,...rest);};});
    await page.getByRole('button',{name:'Save photo',exact:true}).click();
    await expect(page.getByText('Photo saved.',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>window.__photoUpload.type)).toBe(type==='image/webp'?'image/jpeg':'image/webp');
  }
});

test('signed avatar URL is reused across Members navigation without another request', async ({page})=>{
  await page.evaluate(()=>{
    const profile={user_id:'qa-user-a',username:'cached_user',avatar_path:'qa-user-a/photo.webp'};
    localStorage.setItem('qa-settings:qa-user-a',JSON.stringify({profile,preferences:{language:'en',workout_sharing:true,share_workout_notes:false}}));
    localStorage.setItem('qa-community-members',JSON.stringify([profile]));
  });
  await page.reload();
  await expect(page.getByRole('region',{name:'Profile photo',exact:true}).locator('img')).toBeVisible();
  const initial=await page.evaluate(()=>window.__avatarSignCalls);
  await page.getByRole('button',{name:'Community',exact:true}).click();
  for(let i=0;i<3;i++) {
    await page.getByRole('tab',{name:'Members',exact:true}).click();
    await expect(page.getByRole('button',{name:/cached_user/}).locator('img')).toBeVisible();
    await page.getByRole('tab',{name:'Feed',exact:true}).click();
  }
  expect(await page.evaluate(()=>window.__avatarSignCalls)).toBe(initial);
});

const photoFixture = `
Object.assign(profilePhotoApi, {
  async signedUrl(profile, id) {
    window.__avatarSignCalls = (window.__avatarSignCalls || 0) + 1;
    await new Promise(resolve => setTimeout(resolve, Number(localStorage.getItem('photo-sign-delay') || 0)));
    return profile.avatar_path || profile.avatar_url ? '/pwa-192x192.png' : null;
  },
  async upload(blob, id) {
    window.__photoUpload = { type: blob.type, size: blob.size, id };
    await new Promise(resolve => setTimeout(resolve, Number(localStorage.getItem('photo-delay') || 0)));
    if (localStorage.getItem('photo-fail')) throw new Error('Upload failed. Try again.');
    const next = fixtureSettings(id);
    next.profile = { ...next.profile, avatar_path: id + '/' + crypto.randomUUID() + '.webp', avatar_url: null };
    localStorage.setItem('qa-settings:' + id, JSON.stringify(next));
    return next.profile;
  },
  async remove(id) {
    const next = fixtureSettings(id);
    next.profile = { ...next.profile, avatar_path: null, avatar_url: null };
    localStorage.setItem('qa-settings:' + id, JSON.stringify(next));
    return next.profile;
  }
});`;

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/tests/ui/fixtureApi.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + photoFixture });
  });
  await page.addInitScript(() => {
    window.__profileEvents = 0;
    window.addEventListener('lifeos:profile-updated', () => window.__profileEvents++);
  });
  await page.goto('/settings');
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toBeVisible();
});

async function choosePhoto(page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e63040'; ctx.fillRect(0, 0, 400, 600);
    ctx.fillStyle = '#20b080'; ctx.fillRect(400, 0, 400, 600);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.getByLabel('Choose profile photo', { exact: true }).setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });
  await expect(page.getByRole('img', { name: 'Square crop preview' })).toBeVisible();
}

test('username-only save and privacy edits survive photo upload/removal', async ({ page }) => {
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('new_username');
  await page.getByLabel('Share completed workouts', { exact: true }).uncheck();
  await choosePhoto(page);
  await page.getByRole('slider', { name: 'Zoom', exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(page.getByText('Photo saved.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveValue('new_username');
  await expect(page.getByLabel('Share completed workouts', { exact: true })).not.toBeChecked();
  const upload = await page.evaluate(() => window.__photoUpload);
  expect(upload.type).toBe('image/webp'); expect(upload.size).toBeLessThanOrEqual(1024 * 1024); expect(upload.id).toBe('qa-user-a');
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await page.getByRole('button', { name: 'Remove photo', exact: true }).last().click();
  await expect(page.getByText('Photo removed.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-settings:qa-user-a')));
  expect(stored.profile).toEqual({ username: 'new_username' });
  expect(stored.preferences.workout_sharing).toBe(false);
  expect(stored.preferences.share_workout_notes).toBe(false);
  expect(await page.evaluate(() => window.__profileEvents)).toBe(3);
});

test('replacement uses a fresh stable path and cancelling keeps the saved photo', async ({ page }) => {
  await choosePhoto(page);
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(page.getByText('Photo saved.', { exact: true })).toBeVisible();
  const savedPath = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-settings:qa-user-a')).profile.avatar_path);
  await expect(page.getByRole('button', { name: 'Replace photo', exact: true })).toBeVisible();
  await choosePhoto(page);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Square crop preview' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-settings:qa-user-a')).profile.avatar_path)).toBe(savedPath);
  await choosePhoto(page);
  await page.getByRole('slider', { name: 'Horizontal position', exact: true }).fill('100');
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(page.getByText('Photo saved.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-settings:qa-user-a')).profile.avatar_path)).not.toBe(savedPath);
  expect(await page.evaluate(() => window.__profileEvents)).toBe(2);
});

test('invalid sources and failed upload retain a retryable crop', async ({ page }) => {
  const input = page.getByLabel('Choose profile photo', { exact: true });
  await input.setInputFiles({ name: 'photo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('alert')).toContainText('Unsupported photo format.');
  await input.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(15 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert')).toHaveText('Choose a photo up to 15 MB.');
  await input.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.getByRole('alert')).toContainText('Unsupported photo format.');
  await choosePhoto(page);
  await page.evaluate(() => localStorage.setItem('photo-fail', 'yes'));
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Upload failed. Try again.');
  await expect(page.getByRole('img', { name: 'Square crop preview' })).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('photo-fail'));
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(page.getByText('Photo saved.', { exact: true })).toBeVisible();
});

test('in-flight upload is scoped to the captured account', async ({ page }) => {
  await choosePhoto(page);
  await page.evaluate(() => localStorage.setItem('photo-delay', '800'));
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled();
  await page.evaluate(() => window.__qaSignIn('qa-user-b'));
  await expect(page.getByRole('button', { name: 'Add photo', exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText('Photo saved.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add photo', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('qa-settings:qa-user-b'))).toBeNull();
});

test('legacy photos refresh before expiry and fall back on image failure', async ({ page }) => {
  await page.clock.install();
  await page.evaluate(() => localStorage.setItem('qa-settings:qa-user-a', JSON.stringify({
    profile: { username: 'legacy_user', avatar_url: 'https://legacy.example/photo.png' },
    preferences: { language: 'en', workout_sharing: true, share_workout_notes: false },
  })));
  await page.reload();
  const avatar = page.getByRole('region', { name: 'Profile photo', exact: true }).getByRole('img', { name: 'Profile photo', exact: true });
  await expect(avatar.locator('img')).toBeVisible();
  const calls = await page.evaluate(() => window.__avatarSignCalls);
  await page.clock.fastForward(4.5 * 60 * 1000);
  await expect.poll(() => page.evaluate(() => window.__avatarSignCalls)).toBeGreaterThan(calls);
  await avatar.locator('img').dispatchEvent('error');
  await expect(avatar).toHaveText('L');
  await page.evaluate(() => window.__qaSignIn('qa-user-b'));
  await expect(avatar.locator('img')).toHaveCount(0);
});

test('crop coordinates clamp to valid source bounds', () => {
  expect(profilePhotoCrop(800, 600)).toEqual({ x: 100, y: 0, side: 600 });
  expect(profilePhotoCrop(800, 600, { zoom: 2, x: 100, y: 0 })).toEqual({ x: 500, y: 0, side: 300 });
  expect(profilePhotoCrop(800, 600, { zoom: 8, x: -20, y: 200 })).toEqual({ x: 0, y: 400, side: 200 });
});

for (const width of [390, 1024, 1440]) {
  test(`crop preview and controls fit at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await choosePhoto(page);
    const canvas = page.getByRole('img', { name: 'Square crop preview' });
    expect(await canvas.evaluate(element => Array.from(element.getContext('2d').getImageData(256, 256, 1, 1).data))).not.toEqual([0, 0, 0, 0]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('profile-crop.png'), fullPage: true });
  });
}
