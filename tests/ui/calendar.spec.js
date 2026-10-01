import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('qa-calendar-seeded')) return;
    sessionStorage.setItem('qa-calendar-seeded', 'true');
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
    localStorage.setItem('qa-calendar', JSON.stringify([
      { id: 'qa-event', title: 'Release review', event_date: date, start_time: '09:30', end_time: '10:30', category: 'Work', status: 'planned', location: 'Studio', notes: 'Review the release checklist and remaining device QA.' },
      { id: 'qa-evening', title: 'Training appointment', event_date: date, start_time: '18:00', end_time: '19:00', category: 'Workout', status: 'planned' },
    ]));
  });
});

test('Calendar week navigation, direct date selection and Today preserve agenda', async ({ page }) => {
  await page.goto('/calendar');
  const date = await page.getByLabel('Choose calendar date').inputValue();
  await expect(page.getByText('Release review', { exact: true })).toBeVisible();
  const week = page.getByRole('navigation', { name: 'Calendar week' });
  await expect(week.getByRole('button', { pressed: true })).toHaveCount(1);
  await week.getByRole('button', { name: 'Next week' }).click();
  await expect(page.getByLabel('Choose calendar date')).not.toHaveValue(date);
  await expect(page.getByText('Release review', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByLabel('Choose calendar date')).toHaveValue(date);
  await page.getByLabel('Choose calendar date').fill('2026-12-01');
  await expect(page.getByText('No events on this day', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByText('Release review', { exact: true })).toBeVisible();
});

test('Calendar native editor preserves create/edit/delete and focus', async ({ page }) => {
  await page.goto('/calendar');
  const create = page.getByRole('button', { name: 'New event', exact: true });
  await create.click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Title', { exact: true }).fill('Dentist appointment');
  await editor.getByLabel('Start', { exact: true }).fill('11:45');
  await editor.getByLabel('End', { exact: true }).fill('12:45');
  await editor.getByLabel('Category', { exact: true }).selectOption('Health');
  await editor.getByLabel('Location', { exact: true }).fill('Clinic');
  await editor.getByLabel('Notes', { exact: true }).fill('Bring appointment confirmation');
  await editor.getByRole('button', { name: 'Create Event', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(create).toBeFocused();
  const row = page.locator('article').filter({ hasText: 'Dentist appointment' });
  await expect(row).toContainText('11:45-12:45');
  await row.getByRole('button', { name: 'Edit event', exact: true }).click();
  await editor.getByLabel('Title', { exact: true }).fill('Dental check');
  await editor.getByRole('button', { name: 'Update Event', exact: true }).click();
  await expect(page.getByText('Dental check', { exact: true })).toBeVisible();
  await page.reload();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('article').filter({ hasText: 'Dental check' }).getByRole('button', { name: 'Delete event permanently' }).click();
  await expect(page.getByText('Dental check', { exact: true })).toHaveCount(0);
});

test('all Calendar status transitions remain available without deleting events', async ({ page }) => {
  await page.goto('/calendar');
  const row = page.locator('article').filter({ hasText: 'Release review' });
  for (const status of ['done', 'skipped', 'cancelled', 'planned']) {
    await row.getByRole('button', { name: `Mark ${status}`, exact: true }).click();
    await expect(row.getByText(status, { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: `Mark ${status}`, exact: true })).toBeDisabled();
  }
  await page.reload();
  await expect(row.getByText('planned', { exact: true })).toBeVisible();
});

test('Calendar rejects identical end time and failed save keeps every field', async ({ page }) => {
  await page.goto('/calendar');
  await page.getByRole('button', { name: 'New event', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Title', { exact: true }).fill('Keep this appointment');
  await editor.getByLabel('Start', { exact: true }).fill('09:30');
  await editor.getByLabel('End', { exact: true }).fill('09:30');
  await editor.getByRole('button', { name: 'Create Event', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('after start');
  await editor.getByLabel('End', { exact: true }).fill('10:30');
  await page.evaluate(() => localStorage.setItem('qa-calendar-fail', 'true'));
  await editor.getByRole('button', { name: 'Create Event', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('not saved');
  await expect(editor.getByLabel('Start', { exact: true })).toHaveValue('09:30');
  await expect(editor.getByLabel('Title', { exact: true })).toHaveValue('Keep this appointment');
  await page.evaluate(() => localStorage.removeItem('qa-calendar-fail'));
  await editor.getByRole('button', { name: 'Create Event', exact: true }).click();
  await expect(editor).toHaveCount(0);
});

test('save in flight blocks dismissal and duplicate submit', async ({ page }) => {
  await page.goto('/calendar');
  await page.evaluate(() => localStorage.setItem('qa-calendar-delay', '1500'));
  await page.getByRole('button', { name: 'New event', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Title', { exact: true }).fill('One calendar write');
  await editor.getByRole('button', { name: 'Create Event', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Saving Event' })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Close event modal' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-calendar')).filter((row) => row.title === 'One calendar write').length)).toBe(1);
});

test('calendar loading failure does not claim an empty day', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('qa-calendar', '[]'); localStorage.setItem('qa-calendar-fail', 'true'); });
  await page.goto('/calendar');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('No events on this day', { exact: true })).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem('qa-calendar-fail'));
  await page.getByRole('button', { name: 'Retry calendar' }).click();
  await expect(page.getByText('No events on this day', { exact: true })).toBeVisible();
});

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932], [1280, 800], [1440, 900], [1920, 1080]]) {
  test(`Calendar workspace fits ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/calendar');
    await expect(page.getByText('Release review', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('calendar.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await page.getByRole('button', { name: 'Mark done' }).first().boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).filter({ visible: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).filter({ visible: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath('calendar-editor.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New event', exact: true })).toBeFocused();
    expect(errors).toEqual([]);
  });
}
