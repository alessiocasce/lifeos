import { test, expect } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

for (const width of [360, 390, 430, 768, 1024, 1440]) for (const size of [[1024, 1024], [1200, 1800]]) {
  test(`Community real photo ${size.join('x')} fits ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const photo = await page.evaluate(([width, height]) => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#26486a'; context.fillRect(0, 0, width, height);
      context.fillStyle = '#d0e3ff'; context.fillRect(width / 4, height / 4, width / 2, height / 2);
      return canvas.toDataURL();
    }, size);
    await page.addInitScript(photo => {
      localStorage.setItem('qa-community-members', JSON.stringify([{ user_id: 'qa-user-b', username: 'photo_member', avatar_url: photo }]));
    }, photo);
    await page.goto('/community#member=qa-user-b');
    const trigger = page.getByRole('button', { name: 'View profile photo', exact: true });
    await expect(trigger.locator('img')).toBeVisible();
    await trigger.tap();
    const dialog = page.getByRole('dialog', { name: 'Profile photo', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toHaveAttribute('tabindex');
    // A photo is an overlay, not a small focus/zoom destination for iOS.
    await expect(dialog.getByRole('button', { name: 'Close profile photo', exact: true })).toBeFocused();
    await dialog.evaluate(async el => {
      await el.querySelector('img').decode();
      await Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished));
    });
    const geometry = await dialog.evaluate(el => {
      const rect = node => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom, right: box.right }; };
      return { dialog: rect(el), circle: rect(el.querySelector('.settings-photo-circle')), image: rect(el.querySelector('img')), scale: visualViewport.scale, viewport: { width: visualViewport.width, height: visualViewport.height }, scroll: { width: el.scrollWidth, height: el.scrollHeight } };
    });
    await info.attach('photo-geometry', { body: JSON.stringify(geometry), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath('community-photo.png') });
    expect(geometry.circle.height).toBeCloseTo(geometry.circle.width, 0);
    expect(geometry.dialog.width).toBeCloseTo(geometry.viewport.width, 0);
    expect(geometry.dialog.height).toBeCloseTo(geometry.viewport.height, 0);
    expect(geometry.image.height).toBeLessThanOrEqual(geometry.circle.height + 1);
    expect(geometry.dialog.y).toBeGreaterThanOrEqual(0);
    expect(geometry.circle.bottom).toBeLessThanOrEqual(geometry.viewport.height);
    expect(geometry.circle.right).toBeLessThanOrEqual(geometry.viewport.width);
    expect(geometry.scale).toBe(1);
    await page.touchscreen.tap(5, 100);
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
