import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('qa-reports-seeded')) return;
    sessionStorage.setItem('qa-reports-seeded', 'true');
    localStorage.setItem('qa-chat-threads', JSON.stringify([{ id: 'qa-thread', title: 'Training decisions', status: 'active', updated_at: new Date().toISOString() }]));
    localStorage.setItem('qa-chat-messages', JSON.stringify([{ id: 'qa-message', thread_id: 'qa-thread', role: 'assistant', content: 'Your last working set was 25 kg for 8 reps.', created_at: new Date().toISOString() }]));
  });
});

async function openAnswer(page) {
  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Open Companion context' }).click();
  await page.getByRole('button', { name: 'Training decisions', exact: true }).click();
  await page.getByRole('button', { name: 'Save assistant answer to Vault' }).click();
  return page.getByRole('dialog', { name: 'Save Brain Answer' });
}

async function openReports(page) {
  await page.getByRole('button', { name: 'Open Companion context' }).click();
  const context = page.getByRole('dialog', { name: 'Companion context' });
  await context.getByRole('button', { name: /Brain Data/ }).click();
  const reports = context.getByRole('button', { name: /Saved Reports/ });
  if (await reports.getAttribute('aria-expanded') !== 'true') await reports.click();
  return context;
}

test('report save retains failed fields, succeeds once, persists and repairs embeddings', async ({ page }) => {
  const modal = await openAnswer(page);
  await modal.getByRole('textbox', { name: 'Title', exact: true }).fill('Pull session analysis');
  await modal.getByRole('combobox', { name: 'Type' }).selectOption('workout_report');
  await modal.getByRole('textbox', { name: 'Tags' }).fill('pull, progression');
  await page.evaluate(() => localStorage.setItem('qa-report-fail', 'true'));
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Report was not saved');
  await expect(modal.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Pull session analysis');
  await page.evaluate(() => localStorage.removeItem('qa-report-fail'));
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Save assistant answer to Vault' })).toBeFocused();
  await page.reload();
  const context = await openReports(page);
  await expect(context.getByRole('button', { name: /^workout report Pull session analysis/ })).toBeVisible();
  await context.getByRole('button', { name: 'Re-embed', exact: true }).click();
  await expect(context.getByText('Re-embedded 1 chunk.', { exact: true })).toBeVisible();
  const rows = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-reports')));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ document_type: 'workout_report', tags: ['pull', 'progression'], content_md: 'Your last working set was 25 kg for 8 reps.' });
});

test('in-flight report save prevents dismissal, duplicate submit and field changes', async ({ page }) => {
  const modal = await openAnswer(page);
  await page.evaluate(() => localStorage.setItem('qa-report-delay', '1200'));
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal.getByRole('textbox', { name: 'Title', exact: true })).toBeDisabled();
  await expect(modal.getByRole('button', { name: 'Close Vault save' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
  await expect(modal).not.toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-reports')))).toHaveLength(1);
});

test('report details trap focus, archive failure remains visible, archive retry removes only report', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const modal = await openAnswer(page);
  await modal.getByRole('textbox', { name: 'Title', exact: true }).fill('Training note');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal).not.toBeVisible();
  const context = await openReports(page);
  await context.getByRole('button', { name: /Training note/, exact: false }).first().click();
  const detail = page.getByRole('dialog', { name: 'Training note', exact: true });
  await expect(detail).toContainText('25 kg for 8 reps');
  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press('Tab');
    // Native dialogs allow the browser chrome in the tab cycle, not background controls.
    if (await page.evaluate(() => document.activeElement === document.body)) await page.keyboard.press('Tab');
    expect(await detail.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await context.getByRole('button', { name: 'Refresh Vault documents' }).evaluate((node) => node.focus());
  expect(await detail.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(detail).not.toBeVisible();
  await expect(context.getByRole('button', { name: /Training note/ }).first()).toBeFocused();
  await context.getByRole('button', { name: /Training note/ }).first().click();
  await page.evaluate(() => localStorage.setItem('qa-report-fail', 'true'));
  await detail.getByRole('button', { name: 'Archive Vault document' }).click();
  await expect(detail.getByRole('alert')).toContainText('not saved or archived');
  await expect(detail).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('qa-report-fail'));
  await detail.getByRole('button', { name: 'Archive Vault document' }).click();
  await expect(detail).not.toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-reports')))).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-chat-messages')))).toHaveLength(1);
  expect(errors).toEqual([]);
});

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932], [1280, 800], [1440, 900], [1920, 1080]]) {
  test(`report dialogs fit ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const modal = await openAnswer(page);
    await expect(modal.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    expect(await modal.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('report-save.png') });
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Save assistant answer to Vault' })).toBeFocused();
    await page.getByRole('button', { name: 'Save assistant answer to Vault' }).click();
    await modal.getByRole('textbox', { name: 'Title', exact: true }).fill('Training progression and next-session working-set targets');
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modal).not.toBeVisible();
    const context = await openReports(page);
    await context.getByRole('button', { name: /^brain answer Training progression/ }).click();
    const detail = page.getByRole('dialog', { name: 'Training progression and next-session working-set targets', exact: true });
    await expect(detail).toBeVisible();
    expect(await detail.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('report-detail.png') });
  });
}
