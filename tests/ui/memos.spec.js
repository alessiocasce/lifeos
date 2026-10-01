import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('qa-memos-seeded')) return;
    sessionStorage.setItem('qa-memos-seeded', 'true');
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
    localStorage.setItem('qa-memos', JSON.stringify([
      { id: 'qa-dated', title: 'Bring training straps', memo_date: today, memo_time: null, status: 'open', notes: 'Keep them in the gym bag.' },
      { id: 'qa-loose', title: 'Compare travel options', memo_date: null, memo_time: null, status: 'open', notes: 'Review alternatives before deciding.' },
      { id: 'qa-closed', title: 'Renew membership', status: 'done' },
    ]));
  });
});

test('memo queue shows each reminder once and preserves done/dismiss/reopen', async ({ page }) => {
  await page.goto('/memos');
  await expect(page.getByText('Bring training straps', { exact: true })).toHaveCount(1);
  const dated = page.locator('article').filter({ hasText: 'Bring training straps' });
  await dated.getByRole('button', { name: 'Mark memo done' }).click();
  await expect(dated).toBeHidden();
  await page.locator('summary').filter({ hasText: 'Completed / Dismissed' }).click();
  await dated.getByRole('button', { name: 'Reopen memo' }).click();
  await expect(dated.getByRole('button', { name: 'Mark memo done' })).toBeVisible();
  await dated.getByRole('button', { name: 'Dismiss memo' }).click();
  await expect(dated.getByText('dismissed', { exact: true })).toBeVisible();
  await page.reload();
  await page.locator('summary').filter({ hasText: 'Completed / Dismissed' }).click();
  await expect(dated.getByText('dismissed', { exact: true })).toBeVisible();
});

test('memo editor preserves create/edit/delete, optional date and focus', async ({ page }) => {
  await page.goto('/memos');
  const create = page.getByRole('button', { name: 'Create memo', exact: true });
  await create.click();
  let editor = page.getByRole('dialog');
  await editor.getByLabel('Remember', { exact: true }).fill('Arrange haircut');
  await editor.getByRole('button', { name: 'Tomorrow', exact: true }).click();
  await editor.getByLabel('Time Optional').fill('09:30');
  await editor.getByLabel('Notes Optional').fill('Call first');
  await editor.getByRole('button', { name: 'Create Memo', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(create).toBeFocused();
  const memo = page.locator('article').filter({ hasText: 'Arrange haircut' });
  await memo.getByRole('button', { name: 'Edit memo' }).click();
  editor = page.getByRole('dialog');
  await expect(editor.getByLabel('Time Optional')).toHaveValue('09:30');
  await editor.getByRole('button', { name: 'Clear Date', exact: true }).click();
  await editor.getByRole('button', { name: 'Clear Time', exact: true }).click();
  await editor.getByRole('button', { name: 'Update Memo', exact: true }).click();
  await expect(memo).toContainText('No date');
  page.once('dialog', (dialog) => dialog.accept());
  await memo.getByRole('button', { name: 'Delete memo' }).click();
  await expect(memo).toHaveCount(0);
});

test('failed memo save keeps form and failed status leaves memo open', async ({ page }) => {
  await page.goto('/memos');
  await page.evaluate(() => localStorage.setItem('qa-memo-fail', 'true'));
  await page.getByRole('button', { name: 'Create memo', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Remember', { exact: true }).fill('Keep this draft');
  await editor.getByRole('button', { name: 'Create Memo', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('not saved');
  await expect(editor.getByLabel('Remember', { exact: true })).toHaveValue('Keep this draft');
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  const memo = page.locator('article').filter({ hasText: 'Bring training straps' });
  await memo.getByRole('button', { name: 'Mark memo done' }).click();
  await expect(page.getByRole('alert')).toContainText('not saved');
  await expect(memo.getByRole('button', { name: 'Mark memo done' })).toBeEnabled();
});

test('saving memo cannot be closed or submitted twice', async ({ page }) => {
  await page.goto('/memos');
  await page.evaluate(() => localStorage.setItem('qa-memo-delay', '1500'));
  await page.getByRole('button', { name: 'Create memo', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Remember', { exact: true }).fill('One confirmed write');
  await editor.getByRole('button', { name: 'Create Memo', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Saving Memo' })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Close memo editor' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-memos')).filter((row) => row.title === 'One confirmed write').length)).toBe(1);
});

test('empty Memos has no counters or fabricated attention', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qa-memos', '[]'));
  await page.goto('/memos');
  await expect(page.getByText('No memos.', { exact: true })).toBeVisible();
  await expect(page.getByText('Due Now', { exact: true })).toHaveCount(0);
});

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932], [1280, 800], [1440, 900], [1920, 1080]]) {
  test(`Memos workspace fits ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/memos');
    await expect(page.getByText('Bring training straps', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('memos.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const action = page.locator('article').first().getByRole('button').first();
    const bounds = await action.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'Create memo', exact: true }).click();
    const editor = page.getByRole('dialog');
    await expect(editor).toBeVisible();
    await editor.getByLabel('Remember', { exact: true }).fill('Prepare travel documents and check the departure time');
    await page.screenshot({ path: info.outputPath('memo-editor.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
