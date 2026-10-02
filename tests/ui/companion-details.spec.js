import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('qa-action-logs', JSON.stringify(Array.from({ length: 12 }, (_, index) => ({
      id: `log-${index}`, action_type: 'create_memo', source: 'whatsapp', status: index === 11 ? 'error' : 'success', action_count: 1,
      created_at: new Date().toISOString(), user_message: `Request ${index + 1}`, answer: 'Saved the requested reminder.',
      error_message: index === 11 ? 'Test request was rejected.' : null,
      record_refs: [{ table: 'memos', id: `memo-${index}`, label: `Training follow-up ${index + 1}` }], actions: [{ type: 'create_memo', title: 'Training follow-up' }],
    }))));
    localStorage.setItem('qa-assumptions', JSON.stringify([
      { kind: 'routine', label: 'Creatine', text: 'inactive', uncertain: false },
      { kind: 'routine', label: 'Skin', text: 'suspended', uncertain: false },
      { kind: 'routine', label: 'Shower', text: 'active', uncertain: true },
      { kind: 'preference', label: 'Communication', text: 'Clear technical explanations', uncertain: false },
    ]));
  });
});

async function openContext(page) {
  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Open Companion context' }).click();
  return page.getByRole('dialog', { name: 'Companion context' });
}

test('action detail owns focus and Escape returns to the still-open context', async ({ page }) => {
  const context = await openContext(page);
  const opener = context.getByRole('button', { name: /MEMO: TRAINING FOLLOW-UP 1\b/ }).first();
  await opener.click();
  const detail = page.getByRole('dialog', { name: 'AI action detail' });
  await expect(detail.getByRole('button', { name: 'Close action detail' })).toBeFocused();
  await context.getByRole('button', { name: 'Refresh current understanding' }).evaluate((node) => node.focus());
  expect(await detail.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await expect(detail).toContainText('Request 1');
  await expect(detail).toContainText('Saved the requested reminder.');
  await page.keyboard.press('Escape');
  await expect(detail).not.toBeVisible();
  await expect(context).toBeVisible();
  await expect(opener).toBeFocused();
});

test('routine labels are human-readable and all loaded action history remains accessible', async ({ page }) => {
  const context = await openContext(page);
  await expect(context.getByText('No longer current', { exact: true })).toBeVisible();
  await expect(context.getByText('Paused', { exact: true })).toBeVisible();
  await expect(context.getByText('Not certain', { exact: true })).toBeVisible();
  await expect(context.getByText('Clear technical explanations', { exact: true })).toBeVisible();
  await context.getByRole('button', { name: 'View more', exact: true }).click();
  await expect(context.getByRole('button', { name: /MEMO: TRAINING FOLLOW-UP 11\b/ })).toBeVisible();
  await context.getByRole('button', { name: 'Errors (1)', exact: true }).click();
  await context.getByRole('button', { name: /MEMO: TRAINING FOLLOW-UP 12\b/ }).click();
  await expect(page.getByRole('dialog', { name: 'AI action detail' })).toContainText('Test request was rejected.');
});

test('long action responses scroll without losing the close control', async ({ page }) => {
  await page.addInitScript(() => {
    const logs = JSON.parse(localStorage.getItem('qa-action-logs'));
    logs[0].answer = `${'Recorded set details and next-session context.\n\n'.repeat(100)}Last response line.`;
    localStorage.setItem('qa-action-logs', JSON.stringify(logs));
  });
  const context = await openContext(page);
  await context.getByRole('button', { name: /MEMO: TRAINING FOLLOW-UP 1\b/ }).first().click();
  const detail = page.getByRole('dialog', { name: 'AI action detail' });
  await detail.getByText('Last response line.', { exact: true }).scrollIntoViewIfNeeded();
  await expect(detail.getByRole('button', { name: 'Close action detail' })).toBeVisible();
  const close = await detail.getByRole('button', { name: 'Close action detail' }).boundingBox();
  expect(close.y).toBeGreaterThanOrEqual(0);
  expect(close.y + close.height).toBeLessThanOrEqual(844);
  await detail.getByRole('button', { name: 'Close action detail' }).click();
  await expect(context).toBeVisible();
});

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932], [1280, 800], [1440, 900], [1920, 1080]]) {
  test(`action details fit ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const context = await openContext(page);
    await context.getByRole('button', { name: /MEMO: TRAINING FOLLOW-UP 1\b/ }).first().click();
    const detail = page.getByRole('dialog', { name: 'AI action detail' });
    await detail.getByText('Sanitized Actions', { exact: true }).click();
    await expect(detail).toContainText('create_memo');
    expect(await detail.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('action-detail.png') });
    await detail.getByRole('button', { name: 'Close action detail' }).click();
    await expect(context).toBeVisible();
    expect(errors).toEqual([]);
  });
}
