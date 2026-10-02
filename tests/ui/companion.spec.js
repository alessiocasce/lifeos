import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('qa-chat-threads', JSON.stringify([{ id: 'qa-thread', title: 'Training decisions', status: 'active', updated_at: new Date().toISOString() }]));
    localStorage.setItem('qa-chat-messages', JSON.stringify([{ id: 'qa-message', thread_id: 'qa-thread', role: 'assistant', content: 'Your last working set was 25 kg for 8 reps.', created_at: new Date().toISOString() }]));
    localStorage.setItem('qa-memories', JSON.stringify([{ id: 'qa-memory', title: 'Communication', content: 'Clear technical explanations', importance: 4, category: 'preference' }]));
  });
});

test('Companion conversation survives navigation and corrections remain unsent', async ({ page }) => {
  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Open Companion context' }).click();
  const panel = page.getByRole('dialog', { name: 'Companion context' });
  await expect(panel.getByText('No longer current', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Training decisions' }).click();
  await expect(page.getByTestId('brain-message-list')).toContainText('25 kg for 8 reps');
  await page.getByRole('button', { name: 'Command', exact: true }).click();
  await page.getByRole('button', { name: 'Companion', exact: true }).click();
  await expect(page.getByTestId('brain-message-list')).toContainText('25 kg for 8 reps');
  await page.getByRole('button', { name: 'Open Companion context' }).click();
  await panel.getByRole('button', { name: 'Correct Creatine' }).click();
  await expect(page.getByTestId('brain-message-input')).toHaveValue('LifeOS, update your understanding of creatine: ');
  await expect(page.getByTestId('brain-message-input')).toBeFocused();
  await expect(page.getByTestId('brain-message-list')).not.toContainText('update your understanding');
});

test('context permission changes are explicit and memory failures retain the editor', async ({ page }) => {
  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Open Companion context' }).click();
  const panel = page.getByRole('dialog', { name: 'Companion context' });
  await expect(panel.getByRole('checkbox', { name: /Allow project monitoring/ })).not.toBeChecked();
  await panel.getByRole('checkbox', { name: /Allow project monitoring/ }).check();
  await expect(panel.getByRole('checkbox', { name: /Allow proactive messages/ })).not.toBeChecked();
  await panel.getByRole('button', { name: /Saved memories/ }).click();
  await panel.getByRole('button', { name: 'Edit', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Memory content' }).fill('Concise and technical');
  await page.evaluate(() => localStorage.setItem('qa-memory-fail', 'true'));
  await panel.getByRole('button', { name: 'Save memory' }).click();
  await expect(panel.getByRole('alert')).toContainText('Memory was not saved.');
  await expect(panel.getByRole('textbox', { name: 'Memory content' })).toHaveValue('Concise and technical');
  await page.evaluate(() => localStorage.removeItem('qa-memory-fail'));
  await panel.getByRole('button', { name: 'Save memory' }).click();
  await expect(panel.getByText('Concise and technical', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Companion context' })).toBeFocused();
});

test('chat failure keeps input and retries the same request without duplicate bubbles', async ({ page }) => {
  await page.goto('/assistant');
  await page.evaluate(() => localStorage.setItem('qa-brain-fail', 'true'));
  const input = page.getByTestId('brain-message-input');
  await input.fill('Remember my training decision');
  await page.getByTestId('brain-send-button').click();
  await expect(input).toHaveValue('Remember my training decision');
  await expect(page.getByText('Test Brain unavailable.', { exact: true })).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('qa-brain-fail'));
  await page.getByRole('button', { name: /Retry/ }).click();
  await expect(page.getByTestId('brain-message-list')).toContainText('Recorded in this test conversation.');
  await expect(page.getByTestId('brain-message-list').getByText('Remember my training decision', { exact: true })).toHaveCount(1);
  const requests = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-brain-requests')));
  expect(requests).toHaveLength(2);
  expect(requests[0].clientRequestId).toBe(requests[1].clientRequestId);
  expect(requests[0].threadId).toBe(requests[1].threadId);
});

test('forget memory retains failed records and retry removes only the chosen memory', async ({ page }) => {
  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Open Companion context' }).click();
  const panel = page.getByRole('dialog', { name: 'Companion context' });
  await panel.getByRole('button', { name: /Saved memories/ }).click();
  await page.evaluate(() => {
    localStorage.setItem('qa-memory-fail', 'true');
    localStorage.setItem('qa-memory-delay', '500');
  });
  const forget = panel.getByRole('button', { name: 'Forget Communication', exact: true });
  await forget.click();
  await expect(forget).toBeDisabled();
  await expect(panel.getByRole('alert')).toContainText('Memory was not forgotten.');
  await expect(panel.getByText('Clear technical explanations', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-memories')).length)).toBe(1);
  await page.evaluate(() => localStorage.removeItem('qa-memory-fail'));
  await forget.click();
  await expect(forget).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-memories')))).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-chat-messages')).length)).toBe(1);
});

test('populated insights stay secondary, bounded and separate from conversation and memory', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qa-insights', JSON.stringify(
    Array.from({ length: 4 }, (_, i) => ({ id: `qa-insight-${i}`, title: `Recorded insight ${i + 1}`, content: `Recorded observation ${i + 1}` })),
  )));
  await page.goto('/assistant');
  await expect(page.getByText('Recorded insight 1', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Companion context' }).click();
  const panel = page.getByRole('dialog', { name: 'Companion context' });
  await panel.getByRole('button', { name: /Saved memories/ }).click();
  await panel.getByText('Recent insights', { exact: true }).click();
  await expect(panel.getByText('Recorded observation 1', { exact: true })).toBeVisible();
  await expect(panel.getByText('Recorded observation 3', { exact: true })).toBeVisible();
  await expect(panel.getByText('Recorded insight 4', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Training decisions' }).click();
  await expect(page.getByTestId('brain-message-list')).toContainText('25 kg for 8 reps');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-memories')).length)).toBe(1);
});

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932], [1280, 800], [1440, 900], [1920, 1080]]) {
  test(`Companion recovery and memory controls fit ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto('/assistant');
    await page.evaluate(() => localStorage.setItem('qa-brain-fail', 'true'));
    const input = page.getByTestId('brain-message-input');
    await input.fill('Review my training decision');
    await page.getByTestId('brain-send-button').click();
    const retry = page.getByRole('button', { name: 'Retry', exact: true });
    await expect(retry).toBeVisible();
    await retry.scrollIntoViewIfNeeded();
    expect((await retry.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await retry.focus();
    await expect(retry).toBeFocused();
    await page.screenshot({ path: info.outputPath('companion-recovery.png') });
    await page.evaluate(() => localStorage.removeItem('qa-brain-fail'));
    await retry.press('Enter');
    await expect(page.getByTestId('brain-message-list')).toContainText('Recorded in this test conversation.');
    await page.getByRole('button', { name: 'Open Companion context' }).click();
    const panel = page.getByRole('dialog', { name: 'Companion context' });
    await panel.getByRole('button', { name: /Saved memories/ }).click();
    await panel.getByRole('button', { name: 'Edit', exact: true }).click();
    const title = panel.getByRole('textbox', { name: 'Memory title', exact: true });
    expect((await title.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await title.fill('Training communication');
    await title.focus();
    await page.keyboard.press('Tab');
    await expect(panel.getByRole('textbox', { name: 'Memory content', exact: true })).toBeFocused();
    const save = panel.getByRole('button', { name: 'Save memory', exact: true });
    await save.scrollIntoViewIfNeeded();
    const saveBox = await save.boundingBox();
    expect(saveBox.height).toBeGreaterThanOrEqual(44);
    expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: info.outputPath('memory-editor.png') });
    await save.click();
    await expect(panel.getByText('Training communication', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });

  test(`Companion fits ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/assistant');
    const composer = page.getByTestId('brain-message-input');
    await expect(composer).toBeVisible();
    const box = await composer.boundingBox();
    expect(box.y + box.height).toBeLessThan(height - (width < 768 ? 155 : 75));
    await page.screenshot({ path: info.outputPath('companion.png') });
    await page.getByRole('button', { name: 'Open Companion context' }).click();
    const panel = page.getByRole('dialog', { name: 'Companion context' });
    await expect(panel.getByRole('checkbox', { name: /Allow project monitoring/ })).toBeVisible();
    await page.screenshot({ path: info.outputPath('context.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
