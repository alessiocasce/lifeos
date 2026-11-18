import { test, expect } from '@playwright/test';

const answer = 'Start with your main lift.\n\n**Keep it simple**\n\n- Two working sets\n- Rest for two minutes\n- Record how the last set feels';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(answer => {
    localStorage.setItem('qa-chat-threads', JSON.stringify([{ id: 'chat-polish', title: 'A plan for today', status: 'active', updated_at: new Date().toISOString() }]));
    localStorage.setItem('qa-chat-messages', JSON.stringify([
      { id: 'chat-user', thread_id: 'chat-polish', role: 'user', content: 'How should I approach my next session?', created_at: '2026-11-17T12:00:00Z' },
      { id: 'chat-answer', thread_id: 'chat-polish', role: 'assistant', content: answer, created_at: '2026-11-17T12:00:01Z' },
    ]));
  }, answer);
});

async function openChat(page) {
  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Open Companion context' }).click();
  await page.getByRole('button', { name: 'A plan for today', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Companion context' })).not.toBeVisible();
  await expect(page.getByTestId('brain-message-list')).toContainText('Start with your main lift.');
}

test('copy reports success, preserves the answer and does not send or save', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedReply = text; } } }));
  await openChat(page);
  const reply = page.getByRole('article', { name: 'Companion reply' });
  await reply.getByRole('button', { name: 'Copy reply' }).click();
  await expect(reply.getByRole('status')).toHaveText('Reply copied.');
  expect(await page.evaluate(() => window.copiedReply)).toBe(answer);
  expect(await page.evaluate(() => localStorage.getItem('qa-brain-requests'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('qa-reports'))).toBeNull();
  await expect(reply.getByRole('button', { name: 'Save assistant answer to Vault' })).toBeVisible();
});

test('clipboard denial shows an error and remains retryable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { if (!window.allowCopy) throw new Error('Denied'); } } }));
  await openChat(page);
  const reply = page.getByRole('article', { name: 'Companion reply' });
  await reply.getByRole('button', { name: 'Copy reply' }).click();
  await expect(reply.getByRole('alert')).toHaveText('Could not copy. Try again.');
  await page.evaluate(() => { window.allowCopy = true; });
  await reply.getByRole('button', { name: 'Copy reply' }).click();
  await expect(reply.getByRole('status')).toHaveText('Reply copied.');
  await expect(reply.getByRole('alert')).toHaveCount(0);
});

test('reading earlier messages survives an incoming reply and Latest returns to the end', async ({ page }) => {
  await page.addInitScript(() => {
    const rows = JSON.parse(localStorage.getItem('qa-chat-messages'));
    for (let i = 0; i < 30; i++) rows.push({ id: `history-${i}`, thread_id: 'chat-polish', role: i % 2 ? 'assistant' : 'user', content: `Earlier message ${i}: keep the conversation readable.`, created_at: new Date(Date.parse('2026-11-17T12:01:00Z') + i * 1000).toISOString() });
    localStorage.setItem('qa-chat-messages', JSON.stringify(rows));
    localStorage.setItem('qa-brain-delay', '1500');
  });
  await openChat(page);
  const log = page.getByTestId('brain-message-list');
  await page.getByTestId('brain-message-input').fill('What should I do next?');
  await page.getByTestId('brain-send-button').click();
  await expect(page.getByTestId('brain-loading-indicator')).toBeVisible();
  await expect.poll(() => log.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(2);
  await log.evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page.getByRole('button', { name: 'Latest messages' })).toBeVisible();
  await expect(log).toContainText('Recorded in this test conversation.');
  expect(await log.evaluate(element => element.scrollTop)).toBeLessThan(10);
  await page.getByRole('button', { name: 'Latest messages' }).click();
  await expect.poll(() => log.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(2);
  await expect(page.getByRole('button', { name: 'Latest messages' })).toHaveCount(0);
  await expect(log).toBeFocused();
});

test('populated chat, message actions and large text fit every target width', async ({ page }) => {
  await openChat(page);
  for (const width of [360, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const size of ['100%', '200%']) {
      await page.evaluate(size => { document.documentElement.style.fontSize = size; }, size);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const reply = page.getByRole('article', { name: 'Companion reply' });
      const copy = reply.getByRole('button', { name: 'Copy reply' });
      await copy.scrollIntoViewIfNeeded();
      const bounds = await copy.boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `docs/audits/lifeos-ui/screenshots/companion-chat-${width}-${size === '100%' ? 'normal' : 'large'}.png` });
    }
  }
});
