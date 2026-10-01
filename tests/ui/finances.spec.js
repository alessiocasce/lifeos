import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('qa-finances-seeded')) return;
    sessionStorage.setItem('qa-finances-seeded', 'true');
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
    localStorage.setItem('qa-expenses', JSON.stringify([
      { id: 'qa-coffee', vendor: 'Coffee shop', category: 'Food', amount: 4.5, spent_on: today, notes: 'After training' },
      { id: 'qa-gym', vendor: 'Gym membership', category: 'Training', amount: 40, spent_on: today },
      { id: 'qa-old', vendor: 'Old train ticket', category: 'Transport', amount: 20, spent_on: '2025-01-12' },
    ]));
  });
});

test('expense capture, comma decimals, custom category, edit, delete and reload', async ({ page }) => {
  await page.goto('/finances');
  const capture = page.getByRole('region', { name: 'Capture expense' });
  await capture.getByLabel('Vendor', { exact: true }).fill('Bookshop');
  await capture.getByLabel('Amount', { exact: true }).fill('12,50');
  await capture.getByLabel('Category', { exact: true }).fill('Learning');
  await capture.getByLabel('Notes', { exact: true }).fill('Technical reference');
  await capture.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(capture.getByRole('status')).toHaveText('Expense saved.');
  const row = page.locator('article').filter({ hasText: 'Bookshop' });
  await expect(row).toContainText('12.50');
  await row.getByRole('button', { name: 'Edit expense' }).click();
  const edit = page.getByRole('form', { name: 'Edit expense Bookshop' });
  await edit.getByLabel('Vendor', { exact: true }).fill('Bookshop revised');
  await edit.getByLabel('Amount', { exact: true }).fill('15');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Bookshop revised', { exact: true })).toBeVisible();
  await page.reload();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('article').filter({ hasText: 'Bookshop revised' }).getByRole('button', { name: 'Delete expense' }).click();
  await expect(page.getByText('Bookshop revised', { exact: true })).toHaveCount(0);
});

test('selected month controls ledger and real category totals without duplicate rows', async ({ page }) => {
  await page.goto('/finances');
  await expect(page.getByText('Coffee shop', { exact: true })).toHaveCount(1);
  await page.getByText('Category breakdown', { exact: true }).click();
  await expect(page.locator('dl')).toContainText('40.00');
  await page.getByLabel('Month', { exact: true }).fill('2025-01');
  await expect(page.getByRole('region', { name: 'Selected month ledger' })).toContainText('Old train ticket');
  await expect(page.getByRole('region', { name: 'Selected month ledger' })).not.toContainText('Coffee shop');
  await page.getByText('Recent expenses in other months', { exact: true }).click();
  await expect(page.getByText('Coffee shop', { exact: true })).toBeVisible();
});

test('failed writes preserve capture and edit fields; failed delete keeps row', async ({ page }) => {
  await page.goto('/finances');
  const capture = page.getByRole('region', { name: 'Capture expense' });
  await capture.getByLabel('Vendor', { exact: true }).fill('Keep this draft');
  await capture.getByLabel('Amount', { exact: true }).fill('10');
  await page.evaluate(() => localStorage.setItem('qa-expense-fail', 'true'));
  await capture.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(capture.getByRole('alert')).toContainText('not saved');
  await expect(capture.getByLabel('Vendor', { exact: true })).toHaveValue('Keep this draft');
  await expect(capture.getByText('Expense saved.', { exact: true })).toHaveCount(0);
  const row = page.locator('article').filter({ hasText: 'Coffee shop' });
  page.once('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: 'Delete expense' }).click();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Edit expense' }).click();
  const edit = page.getByRole('form', { name: 'Edit expense Coffee shop' });
  await edit.getByLabel('Amount', { exact: true }).fill('9');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit.getByRole('alert')).toContainText('not saved');
  await expect(edit.getByLabel('Amount', { exact: true })).toHaveValue('9');
  await page.evaluate(() => localStorage.removeItem('qa-expense-fail'));
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toHaveCount(0);
});

test('empty and failed month loads are distinct and recoverable', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('qa-expenses', '[]'); localStorage.setItem('qa-expense-load-fail', 'true'); });
  await page.goto('/finances');
  await expect(page.getByRole('region', { name: 'Selected month ledger' }).getByRole('alert')).toBeVisible();
  await expect(page.getByText('No expenses this month.', { exact: true })).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem('qa-expense-load-fail'));
  await page.getByRole('button', { name: 'Retry month' }).click();
  await expect(page.getByText('No expenses this month.', { exact: true })).toBeVisible();
  await expect(page.getByText('Category breakdown', { exact: true })).toHaveCount(0);
});

test('delayed expense save prevents duplicate submits and editing captured fields', async ({ page }) => {
  await page.goto('/finances');
  const capture = page.getByRole('region', { name: 'Capture expense' });
  await capture.getByLabel('Vendor', { exact: true }).fill('One receipt');
  await capture.getByLabel('Amount', { exact: true }).fill('8');
  await page.evaluate(() => localStorage.setItem('qa-expense-delay', '1000'));
  await capture.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(capture.getByRole('button', { name: 'Saving expense' })).toBeDisabled();
  await expect(capture.getByLabel('Vendor', { exact: true })).toBeDisabled();
  await expect(capture.getByRole('status')).toHaveText('Expense saved.');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-expenses')).filter((row) => row.vendor === 'One receipt').length)).toBe(1);
});

test('expense validation blocks zero and negative amounts without a write', async ({ page }) => {
  await page.goto('/finances');
  const capture = page.getByRole('region', { name: 'Capture expense' });
  await capture.getByLabel('Vendor', { exact: true }).fill('Invalid receipt');
  for (const amount of ['0', '-3', 'not a number']) {
    await capture.getByLabel('Amount', { exact: true }).fill(amount);
    await capture.getByRole('button', { name: 'Save expense', exact: true }).click();
    await expect(capture.getByRole('alert')).toContainText('greater than zero');
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-expenses')).some((row) => row.vendor === 'Invalid receipt'))).toBe(false);
});

test('Rome midnight updates untouched defaults but preserves explicitly selected dates and month', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-31T22:59:00Z') });
  await page.goto('/finances');
  const capture = page.getByRole('region', { name: 'Capture expense' });
  await expect(capture.getByLabel('Date', { exact: true })).toHaveValue('2026-10-31');
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('2026-10');
  await page.clock.fastForward(120000);
  await expect(capture.getByLabel('Date', { exact: true })).toHaveValue('2026-11-01');
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('2026-11');
  await capture.getByLabel('Date', { exact: true }).fill('2026-10-15');
  await page.getByLabel('Month', { exact: true }).fill('2025-01');
  await page.clock.fastForward(86400000);
  await expect(capture.getByLabel('Date', { exact: true })).toHaveValue('2026-10-15');
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('2025-01');
});

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932], [1280, 800], [1440, 900], [1920, 1080]]) {
  test('Finances workspace fits ' + width + 'x' + height, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/finances');
    await expect(page.getByText('Gym membership', { exact: true })).toBeVisible();
    if (width < 640) {
      const save = await page.getByRole('button', { name: 'Save expense', exact: true }).boundingBox();
      const dock = await page.locator('.training-dock').boundingBox();
      expect(save.y + save.height).toBeLessThanOrEqual(dock.y);
    }
    await page.screenshot({ path: info.outputPath('finances.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('article').filter({ hasText: 'Gym membership' }).getByRole('button', { name: 'Edit expense' }).click();
    const edit = page.getByRole('form', { name: 'Edit expense Gym membership' });
    await edit.getByRole('button', { name: 'Save changes' }).evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: info.outputPath('finances-edit.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await edit.getByRole('button', { name: 'Save changes' }).boundingBox();
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    if (width < 640) {
      const dock = await page.locator('.training-dock').boundingBox();
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(dock.y);
    }
    expect(errors).toEqual([]);
  });
}
