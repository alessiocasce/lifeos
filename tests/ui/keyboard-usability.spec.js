import { test, expect } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

const viewport = (page, height, top = 0) => page.evaluate(({ height, top }) => {
  Object.defineProperty(visualViewport, 'height', { configurable: true, value: height });
  Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: top });
  visualViewport.dispatchEvent(new Event('resize'));
  visualViewport.dispatchEvent(new Event('scroll'));
}, { height, top });

test('typing leaves most of the visible Companion area for conversation', async ({ page }, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('qa-chat-threads', JSON.stringify([{ id: 'typing-chat', title: 'Typing conversation', status: 'active' }]));
    localStorage.setItem('qa-chat-messages', JSON.stringify(Array.from({ length: 8 }, (_, index) => ({
      id: `typing-${index}`, thread_id: 'typing-chat', role: index % 2 ? 'assistant' : 'user',
      content: `Reply ${index}. ${'Keep this conversation readable while composing the next message. '.repeat(4)}`,
      created_at: new Date(2026, 10, 19, 12, index).toISOString(),
    }))));
  });
  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Open Companion context' }).tap();
  await page.getByRole('button', { name: 'Typing conversation', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: 'Companion context' })).not.toBeVisible();
  await page.getByTestId('brain-message-input').fill('A message');
  await viewport(page, 360, 60);
  await expect.poll(async () => (await page.getByTestId('brain-message-list').boundingBox()).height).toBeGreaterThanOrEqual(270);
  const composer = await page.locator('.companion-composer').boundingBox();
  expect(composer.height).toBeLessThanOrEqual(60);
  await expect(page.locator('.workspace-header')).toBeHidden();
  await page.screenshot({ path: info.outputPath('companion-typing.png'), clip: { x: 0, y: 60, width: 390, height: 360 } });
});

test('send works on the first pointer click while the keyboard stays open', async ({ page }) => {
  await page.goto('/assistant');
  const input = page.getByTestId('brain-message-input');
  await input.fill('Send this once');
  await viewport(page, 360, 60);
  const send = await page.getByTestId('brain-send-button').boundingBox();
  await page.mouse.move(send.x + send.width / 2, send.y + send.height / 2);
  await page.mouse.down();
  await expect(input).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('qa-brain-requests'))).toBeNull();
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('qa-brain-requests') || '[]').length)).toBe(1);
  await expect(page.getByTestId('brain-message-list')).toContainText('Send this once');
});

test('send also works on the first native touch tap with the keyboard open', async ({ page }) => {
  await page.goto('/assistant');
  const input = page.getByTestId('brain-message-input');
  await input.fill('Touch send once');
  await viewport(page, 360, 60);
  await page.getByTestId('brain-send-button').tap();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('qa-brain-requests') || '[]').length)).toBe(1);
  await expect(input).toBeFocused();
});

test('blur does not restore the dock before the keyboard closes; restoration eases', async ({ page }) => {
  await page.goto('/assistant');
  const input = page.getByTestId('brain-message-input');
  await input.fill('Keep this draft');
  await viewport(page, 360);
  await input.blur();
  await expect(page.locator('.mobile-dock')).toBeHidden();
  const sample = await page.evaluate(async () => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 844 });
    visualViewport.dispatchEvent(new Event('resize'));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return document.querySelector('.lifeos-shell').getBoundingClientRect().height;
  });
  expect(sample).toBeGreaterThan(360);
  expect(sample).toBeLessThan(844);
  await expect.poll(() => page.locator('.lifeos-shell').evaluate(el => el.getBoundingClientRect().height)).toBe(844);
  await expect(page.locator('.mobile-dock')).toBeVisible();
  await expect(input).toHaveValue('Keep this draft');
});

test('dock uses the same bottom inset on Companion and other tabs', async ({ page }) => {
  await page.goto('/');
  await viewport(page, 780);
  const bottom = () => page.locator('.mobile-dock').evaluate(el => getComputedStyle(el).bottom);
  expect(await bottom()).toBe('6px');
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Companion', exact: true }).tap();
  expect(await bottom()).toBe('6px');
});

test('exercise search reserves at least two thirds of the small visible screen for results', async ({ page }, info) => {
  await page.addInitScript(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
    localStorage.setItem('qa-workouts', JSON.stringify([{
      id: 'keyboard-training', user_id: 'qa-user-a', name: 'Keyboard training', performed_on: today,
      started_at: new Date().toISOString(), ended_at: null, workout_sets: [],
      template_snapshot: [{ exercise: 'Squat', exercise_order: 1 }],
    }]));
  });
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Exercise', exact: true }).tap();
  const dialog = page.getByRole('dialog', { name: 'Choose exercise', exact: true });
  await dialog.getByRole('button', { name: 'Choose another exercise', exact: true }).tap();
  await dialog.getByRole('textbox').fill('Press');
  await viewport(page, 360, 60);
  const results = dialog.getByRole('group', { name: 'Exercise suggestions' });
  await expect.poll(async () => (await results.boundingBox()).height).toBeGreaterThanOrEqual(240);
  const row = results.locator('[data-exercise-option]').nth(2);
  const box = await row.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: info.outputPath('exercise-typing.png'), clip: { x: 0, y: 60, width: 390, height: 360 } });
  await row.tap();
  await expect(dialog).toHaveCount(0);
});

test('compact exercise filters and custom names work without dismissing the keyboard first', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Exercise', exact: true }).tap();
  const dialog = page.getByRole('dialog', { name: 'Choose exercise', exact: true });
  const input = dialog.getByRole('textbox');
  await input.fill('My custom lift');
  await viewport(page, 360, 60);
  await dialog.getByRole('combobox').tap();
  await expect(input).toBeFocused();
  const menu = dialog.getByRole('listbox');
  await expect(menu).toBeVisible();
  expect((await menu.boundingBox()).width).toBeGreaterThanOrEqual(240);
  await menu.getByRole('option', { name: 'Back', exact: true }).tap();
  await expect(input).toBeFocused();
  await dialog.getByRole('button', { name: 'Use custom exercise', exact: true }).tap();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exercise', exact: true })).toContainText('My custom lift');
});
