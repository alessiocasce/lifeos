import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('quiet Command has no invented metrics or missing-data nags', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qa-workouts', '[]'));
  await page.goto('/');
  await expect(page.getByText('No dated commitments need your attention here.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recorded today' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Open loops' })).toHaveCount(0);
  await expect(page.getByText(/missing sleep|missing habit|spend|0h sleep/i)).toHaveCount(0);
});

test('unavailable calendar is distinguished from a quiet day', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('qa-workouts', '[]'); localStorage.setItem('qa-calendar-fail', 'true'); });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('could not be refreshed');
  await expect(page.getByText('No dated commitments need your attention here.')).toHaveCount(0);
});

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932], [1280, 800], [1440, 900], [1920, 1080]]) {
  test(`populated Command fits ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      localStorage.setItem('qa-calendar', JSON.stringify([{ id: 'qa-event', title: 'Release planning with the engineering team', event_date: today, start_time: '18:30', end_time: '19:30', status: 'planned' }, { id: 'qa-cancelled', title: 'Cancelled item must stay hidden', event_date: today, status: 'cancelled' }]));
      localStorage.setItem('qa-memos', JSON.stringify([{ id: 'qa-memo', title: 'Review the release checklist before publishing', memo_date: today, memo_time: '17:00', status: 'open' }, { id: 'qa-memo-done', title: 'Completed memo must stay hidden', memo_date: today, status: 'done' }]));
      localStorage.setItem('qa-health', JSON.stringify([{ id: 'qa-health', logged_on: today, sleep_hours: 5.5, hygiene: { creatine: { count: 1, times: ['14:00'] } } }]));
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('region', { name: "Today's agenda" })).toContainText('Release planning');
    await expect(page.getByRole('region', { name: 'Open loops' })).toContainText('release checklist');
    await expect(page.getByRole('region', { name: 'Recorded today' })).toContainText('5.5h sleep');
    await expect(page.getByText('Cancelled item must stay hidden')).toHaveCount(0);
    await expect(page.getByText('Completed memo must stay hidden')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('command.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('region', { name: 'Active work' }).getByRole('button', { name: /Active Training/ }).click();
    await expect(page.getByRole('textbox', { name: 'Exercise' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
