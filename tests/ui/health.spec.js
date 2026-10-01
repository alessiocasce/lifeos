import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('health habit edits persist, decrement and survive reload', async ({ page }) => {
  await page.goto('/health');
  await page.getByRole('button', { name: 'Log Shower', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-health'))[0].hygiene.shower.count)).toBe(1);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Daily habits' })).toContainText('1 logged');
  await page.getByRole('button', { name: 'Remove Shower entry', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-health'))[0].hygiene.shower.count)).toBe(0);
});

test('health failure retains edit without false saved feedback', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qa-health-fail', 'true'));
  await page.goto('/health');
  await page.getByRole('button', { name: 'Log Creatine', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not saved');
  await expect(page.getByRole('region', { name: 'Daily habits' })).toContainText('1 logged');
  await expect(page.getByText('Saved', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('qa-health'))).toBeNull();
});

test('selected historical date writes do not change today', async ({ page }) => {
  await page.goto('/health');
  const date = page.getByLabel('Date', { exact: true });
  const today = await date.inputValue();
  await date.fill('2026-01-02');
  await page.getByRole('button', { name: 'Increase Coffee', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const rows = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-health')));
  expect(rows).toHaveLength(1);
  expect(rows[0].logged_on).toBe('2026-01-02');
  expect(rows[0].coffee).toBe(1);
  await date.fill(today);
  await expect(page.getByRole('heading', { name: 'Today Check-In' })).toBeVisible();
});

test('rapid habit edits save serially without losing the latest count', async ({ page }) => {
  await page.goto('/health');
  const log = page.getByRole('button', { name: 'Log Skin', exact: true });
  await log.click();
  await log.click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('qa-health'))[0].hygiene.skin.count)).toBe(2);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Daily habits' })).toContainText('2 logged');
});

test('notes blur retries retain the failed value and persist after recovery', async ({ page }) => {
  await page.goto('/health');
  await page.evaluate(() => localStorage.setItem('qa-health-fail', 'true'));
  const notes = page.getByLabel('Notes', { exact: true });
  await notes.fill('Keep this health context');
  await notes.blur();
  await expect(page.getByRole('alert')).toContainText('not saved');
  await expect(notes).toHaveValue('Keep this health context');
  await page.evaluate(() => localStorage.removeItem('qa-health-fail'));
  await notes.focus();
  await notes.blur();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(notes).toHaveValue('Keep this health context');
});

test('empty Health does not invent recorded patterns', async ({ page }) => {
  await page.goto('/health');
  await expect(page.getByText('No persisted health logs yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recorded patterns' })).toHaveCount(0);
});

test('current routines are separate from daily entries and corrections open Companion without writes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qa-assumptions', JSON.stringify([
    { label: 'Creatine', text: 'inactive', kind: 'routine', uncertain: false },
    { label: 'Shower', text: 'active', kind: 'routine', uncertain: true },
    { label: 'Skincare', text: 'suspended', kind: 'routine', uncertain: false },
    { label: 'Communication', text: 'Technical', kind: 'preference', uncertain: false },
  ])));
  await page.goto('/health');
  const routines = page.getByRole('region', { name: 'Current routines' });
  await expect(routines).toContainText('No longer current');
  await expect(routines).toContainText('Not certain');
  await expect(routines).toContainText('Paused');
  await expect(routines).not.toContainText('Technical');
  await page.getByRole('button', { name: 'Log Creatine', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(routines).toContainText('No longer current');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-health'))[0].hygiene.creatine.count)).toBe(1);
  await routines.getByRole('button', { name: 'Companion', exact: true }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await page.getByRole('button', { name: 'Open Companion context' }).click();
  await page.getByRole('button', { name: 'Correct Creatine', exact: true }).click();
  await expect(page.getByTestId('brain-message-input')).toHaveValue('LifeOS, update your understanding of creatine: ');
  await expect(page.getByTestId('brain-message-input')).toBeFocused();
  await expect(page.getByTestId('brain-message-list')).not.toContainText('update your understanding');
  expect(await page.evaluate(() => localStorage.getItem('qa-watch'))).toBeNull();
});

test('routine read failure retries without blocking health and historical dates never claim current state', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qa-context-fail', 'true'));
  await page.goto('/health');
  const routines = page.getByRole('region', { name: 'Current routines' });
  await expect(routines.getByRole('alert')).toHaveText('Routine state is unavailable.');
  await page.getByRole('button', { name: 'Log Shower', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('qa-context-fail'));
  await routines.getByRole('button', { name: 'Refresh routines' }).click();
  await expect(routines).toContainText('No longer current');
  await page.getByLabel('Date', { exact: true }).fill('2026-01-02');
  await expect(routines).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Log Creatine', exact: true })).toBeVisible();
});

test('absent routines stay quiet and stale responses cannot reappear after leaving Health', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('qa-routines-seeded')) return;
    sessionStorage.setItem('qa-routines-seeded', 'true');
    localStorage.setItem('qa-assumptions', '[]');
  });
  await page.goto('/health');
  await expect(page.getByRole('region', { name: 'Current routines' })).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.setItem('qa-context-delay', '1000');
    localStorage.setItem('qa-assumptions', '[{"label":"Creatine","text":"inactive","kind":"routine","uncertain":false}]');
  });
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.goto('/health');
  await page.getByLabel('Date', { exact: true }).fill('2026-01-02');
  await page.waitForTimeout(1200);
  await expect(page.getByRole('region', { name: 'Current routines' })).toHaveCount(0);
});

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932], [1280, 800], [1440, 900], [1920, 1080]]) {
  test(`Health check-in fits ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      localStorage.setItem('qa-health', JSON.stringify([{ id: 'qa-health', logged_on: today, sleep_hours: 7.5, wake_time: '09:30', sleep_start: '01:15', coffee: 2, adc: 0, notes: 'Evening training session', hygiene: { shower: { count: 1, times: ['10:00'] }, creatine: { count: 1, times: ['14:00'] } } }]));
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/health');
    await expect(page.getByLabel('Wake Time')).toHaveValue('09:30');
    await expect(page.getByRole('region', { name: 'Sleep' })).toContainText('7.5h');
    await expect(page.getByRole('heading', { name: 'Recorded patterns' })).toBeVisible();
    const log = page.getByRole('button', { name: 'Log Shower', exact: true });
    const bounds = await log.boundingBox();
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: info.outputPath('health.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
