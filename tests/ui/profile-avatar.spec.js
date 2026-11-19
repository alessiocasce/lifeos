import { test, expect } from '@playwright/test';

test('profile photos reject incomplete JPEGs and reuse a complete download across views', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4178' ? route.continue() : route.abort());
  await page.goto('/');
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = 'red';
    context.fillRect(0, 0, 128, 64);
    context.fillStyle = 'blue';
    context.fillRect(0, 64, 128, 64);
    return canvas.toDataURL('image/jpeg').split(',')[1];
  });
  const jpeg = Buffer.from(bytes, 'base64');
  let downloads = 0;
  let finishDownload;
  const ready = new Promise(resolve => { finishDownload = resolve; });
  await page.route('**/fixture-avatar.jpg', async route => {
    downloads += 1;
    if (downloads > 1) await ready;
    await route.fulfill({ contentType: 'image/jpeg', body: downloads === 1 ? jpeg.subarray(0, -2) : jpeg });
  });
  await page.addInitScript(() => localStorage.setItem('qa-settings:qa-user-a', JSON.stringify({
    profile: { user_id: 'qa-user-a', username: 'qa_user', avatar_path: 'qa-user-a/photo.jpg', avatar_url: '/fixture-avatar.jpg' },
    preferences: { language: 'en', workout_sharing: true, share_workout_notes: false },
  })));
  await page.goto('/settings');
  const photo = page.getByRole('button', { name: 'View profile photo' });
  const image = photo.locator('img');
  try {
    await expect.poll(() => downloads).toBe(2);
    await expect(image).toHaveCount(0);
  } finally { finishDownload(); }
  await expect(image).toHaveAttribute('src', /^blob:/);
  const bottomPixel = await image.evaluate(async element => {
    await element.decode();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.drawImage(element, 0, 0);
    return [...context.getImageData(64, 96, 1, 1).data];
  });
  expect(bottomPixel[2]).toBeGreaterThan(240);
  const source = await image.getAttribute('src');
  await photo.click();
  const viewer = page.getByRole('dialog', { name: 'Profile photo' });
  await expect(viewer.locator('img')).toHaveAttribute('src', source);
  await page.keyboard.press('Escape');
  const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await nav.getByRole('button', { name: 'Command' }).click();
  await nav.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(image).toHaveAttribute('src', source);
  expect(downloads).toBe(2);
});
