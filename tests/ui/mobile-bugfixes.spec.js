import { test, expect } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('a small downward finger movement on a workout card remains a tap', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qa-community-shares', JSON.stringify([{
    id: 'tap-share', author_id: 'qa-user-a', author: { user_id: 'qa-user-a', username: 'qa_user' },
    title: 'Tap workout', performed_on: '2026-11-18', exercise_count: 1, set_count: 1,
    sets: [{ exercise: 'Squat', set_number: 1, weight: 50, reps: 8 }],
  }])));
  await page.goto('/community');
  const card = page.locator('.community-post').first();
  await expect(card).toBeVisible();
  const prevented = await card.evaluate(element => {
    // WebKit does not expose constructible Touch objects. Dispatch the same
    // coordinates consumed by the listener through portable cancelable events.
    const event = (type, y) => {
      const value = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(value, 'touches', { value: y ? [{ clientX: 100, clientY: y }] : [] });
      return value;
    };
    element.dispatchEvent(event('touchstart', 200));
    const move = event('touchmove', 203);
    element.dispatchEvent(move);
    element.dispatchEvent(event('touchend'));
    return move.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await card.locator('.community-post-open').tap();
  await expect(page).toHaveURL(/#share=/);
});

test('photo viewing has no dialog outline or document overflow and dismisses', async ({ page }, info) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'View profile photo', exact: true }).tap();
  const dialog = page.getByRole('dialog', { name: 'Profile photo', exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.evaluate(async el => { await Promise.all(el.querySelector('.settings-photo-circle').getAnimations().map(animation => animation.finished)); });
  expect(await page.evaluate(() => visualViewport.scale)).toBe(1);
  await page.screenshot({ path: info.outputPath('photo-viewer.png') });
  await page.touchscreen.tap(5, 100);
  await expect(dialog).toHaveCount(0);
});

test('Companion stays within the visual viewport when the keyboard opens and pans', async ({ page }, info) => {
  await page.goto('/assistant');
  const input = page.getByTestId('brain-message-input');
  await input.fill('Keyboard draft');
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 440 });
    Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: 60 });
    visualViewport.dispatchEvent(new Event('resize'));
    visualViewport.dispatchEvent(new Event('scroll'));
  });
  await expect(page.locator('.mobile-dock')).toBeHidden();
  await expect.poll(async () => {
    const box = await input.boundingBox();
    return box.y + box.height;
  }).toBeLessThanOrEqual(500);
  await expect(page.locator('.companion-toolbar')).toBeHidden();
  await page.screenshot({ path: info.outputPath('companion-keyboard.png') });
  await input.blur();
  await page.evaluate(() => {
    delete visualViewport.height; delete visualViewport.offsetTop;
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.mobile-dock')).toBeVisible();
  await expect(input).toHaveValue('Keyboard draft');
  await expect(page.locator('.training-dock')).toHaveCount(0);
});

test('cold Command dock keeps its bottom position after navigation and viewport changes', async ({ page }) => {
  await page.goto('/');
  const dock = page.locator('.mobile-dock');
  await expect(dock).toBeVisible();
  const bottom = async () => { const box = await dock.boundingBox(); return box.y + box.height; };
  expect(await bottom()).toBe(842);
  await dock.getByRole('button', { name: 'Community', exact: true }).tap();
  await dock.getByRole('button', { name: 'Command', exact: true }).tap();
  expect(await bottom()).toBe(842);
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 760 });
    visualViewport.dispatchEvent(new Event('resize'));
  });
  // Native fixed positioning handles browser chrome; do not add this visual
  // viewport difference a second time to the dock's bottom inset.
  expect(await dock.evaluate(el => getComputedStyle(el).bottom)).toBe('2px');
});

test('exercise search stays visible with usable results above a panned keyboard', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Exercise', exact: true }).tap();
  const dialog = page.getByRole('dialog', { name: 'Choose exercise', exact: true });
  const search = dialog.getByRole('textbox');
  await search.fill('Squat');
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 380 });
    Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: 80 });
    visualViewport.dispatchEvent(new Event('resize'));
    visualViewport.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await search.boundingBox()).y).toBeGreaterThanOrEqual(80);
  await expect.poll(async () => { const box = await dialog.boundingBox(); return box.y + box.height; }).toBeLessThanOrEqual(460);
  const list = dialog.locator('[data-exercise-option]').first();
  await expect(list).toBeVisible();
  await list.tap();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exercise', exact: true })).toContainText(/Squat/i);
});

test('keyboard resize retains the latest reply in a long conversation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('qa-chat-threads', JSON.stringify([{ id: 'keyboard-chat', title: 'Keyboard chat', status: 'active' }]));
    localStorage.setItem('qa-chat-messages', JSON.stringify(Array.from({ length: 20 }, (_, i) => ({
      id: `message-${i}`, thread_id: 'keyboard-chat', role: i % 2 ? 'assistant' : 'user',
      content: `Message ${i}: ${'A conversation worth keeping visible. '.repeat(8)}`, created_at: new Date(2026, 10, 19, 12, i).toISOString(),
    }))));
  });
  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Open Companion context' }).click();
  await page.getByRole('button', { name: 'Keyboard chat', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Companion context' })).not.toBeVisible();
  const messages = page.getByTestId('brain-message-list');
  await expect(messages).toContainText('Message 19:');
  const gap = () => messages.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight);
  await expect.poll(gap).toBeLessThan(3);
  await page.getByTestId('brain-message-input').focus();
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 440 });
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect.poll(gap).toBeLessThan(3);
});
