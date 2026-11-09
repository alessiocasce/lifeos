import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('modern-community')) return;
    sessionStorage.setItem('modern-community', '1');
    const author = { user_id: 'qa-user-b', username: 'degra' };
    localStorage.setItem('qa-community-members', JSON.stringify([author, { user_id: 'qa-user-a', username: 'casce' }]));
    localStorage.setItem('qa-settings:qa-user-a', JSON.stringify({ profile: { user_id: 'qa-user-a', username: 'casce' }, preferences: { language: 'en', workout_sharing: true, share_workout_notes: false } }));
    localStorage.setItem('qa-settings:qa-user-b', JSON.stringify({ profile: author, preferences: { language: 'en', workout_sharing: true, share_workout_notes: false } }));
    localStorage.setItem('qa-workouts', '[]');
    localStorage.setItem('qa-community-shares', JSON.stringify(Array.from({ length: 12 }, (_, i) => ({
      id: `modern-${i}`, author, author_id: author.user_id, title: `Recorded session ${i + 1}`,
      performed_on: `2026-10-${String(28 - i).padStart(2, '0')}`, exercise_count: 1, set_count: 1,
      exercise_preview: [{ exercise: 'Bench Press' }], sets: [{ exercise: 'Bench Press', weight: 40, reps: 8, set_number: 1 }],
    }))));
  });
});

const tab = (page, name) => page.getByRole('tab', { name, exact: true });

test('More stays modal during dismissal, restores focus and supports reduced motion', async ({ page }) => {
  await page.goto('/community');
  const more = page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'More', exact: true });
  await more.click();
  const dialog = page.getByRole('dialog', { name: 'Your system' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close utilities' }).click();
  expect(await page.locator('dialog.utility-sheet').evaluate(el => el.open)).toBe(true);
  await expect(dialog).not.toBeVisible();
  await expect(more).toBeFocused();
  await more.click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(more).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await more.click();
  await dialog.getByRole('button', { name: 'Close utilities' }).click();
  await expect(dialog).not.toBeVisible();
});

test('Feed and Members retain pages, search and scroll without a return loading flash', async ({ page }) => {
  await page.goto('/community');
  await expect(page.getByRole('article')).toHaveCount(10);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(12);
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.evaluate(() => localStorage.setItem('qa-community-delay', '1500'));
  await tab(page, 'Members').click();
  await page.getByRole('textbox', { name: 'Find members' }).fill('degra');
  await expect(page.getByRole('button', { name: '@degra', exact: true })).toBeVisible();
  await tab(page, 'Feed').click();
  await expect(page.getByRole('article')).toHaveCount(12, { timeout: 700 });
  await expect(page.getByText('Loading Community...', { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
  await tab(page, 'Members').click();
  await expect(page.getByRole('textbox', { name: 'Find members' })).toHaveValue('degra');
});

test('privacy invalidation rejects an already-running stale response and cannot restore revoked cards', async ({ page }) => {
  await page.goto('/community');
  await expect(page.getByRole('article')).toHaveCount(10);
  await page.evaluate(() => {
    localStorage.setItem('qa-community-delay', '700');
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    localStorage.setItem('qa-community-shares', '[]');
    window.dispatchEvent(new Event('lifeos:profile-updated'));
  });
  await expect(page.getByRole('article')).toHaveCount(0);
  await tab(page, 'Members').click();
  await tab(page, 'Feed').click();
  await page.waitForTimeout(900);
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByText('No shared workouts yet.', { exact: true })).toBeVisible();
});

test('refresh replaces every loaded page and failed revalidation hides cached content with recovery', async ({ page }) => {
  await page.goto('/community');
  await expect(page.getByRole('article')).toHaveCount(10);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(12);
  await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('qa-community-shares'));
    localStorage.setItem('qa-community-shares', JSON.stringify(rows.filter(row => !['modern-2', 'modern-11'].includes(row.id))));
    localStorage.setItem('qa-community-delay', '500');
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByRole('article')).toHaveCount(12);
  await expect(page.getByText('Loading Community...', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(10);
  await expect(page.getByRole('heading', { name: 'Recorded session 12', exact: true })).toHaveCount(0);
  await page.evaluate(() => { localStorage.setItem('qa-community-fail', 'yes'); window.dispatchEvent(new Event('focus')); });
  await expect(page.getByRole('alert')).toContainText('Community is unavailable. Try again.');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem('qa-community-fail'));
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(10);
});

test('revoked detail evicts its cached Feed before returning', async ({ page }) => {
  await page.goto('/community');
  await expect(page.getByRole('article')).toHaveCount(10);
  await page.evaluate(() => localStorage.setItem('qa-community-shares', '[]'));
  await page.getByRole('button', { name: /Recorded session 1.*View workout/ }).first().click();
  await expect(page.getByText('This workout is private or unavailable.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByText('No shared workouts yet.', { exact: true })).toBeVisible();
});

test('account switch rejects an old response and never reuses the previous viewer cache', async ({ page }) => {
  await page.goto('/community');
  await expect(page.getByRole('article')).toHaveCount(10);
  await page.evaluate(() => { localStorage.setItem('qa-community-delay', '700'); window.dispatchEvent(new Event('focus')); });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const row = JSON.parse(localStorage.getItem('qa-community-shares'))[0];
    localStorage.setItem('qa-community-shares', JSON.stringify([{ ...row, id: 'viewer-b-result', title: 'New viewer result' }]));
    localStorage.removeItem('qa-community-delay');
    window.__qaSignIn('qa-user-b');
  });
  await expect(page.getByRole('heading', { name: 'New viewer result', exact: true })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Recorded session 1', exact: true })).toHaveCount(0);
});

test('keyboard tabs and workspace return preserve member search', async ({ page }) => {
  await page.goto('/community');
  await tab(page, 'Feed').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'Members')).toBeFocused();
  await page.getByRole('textbox', { name: 'Find members' }).fill('degra');
  await expect(page.getByRole('button', { name: '@degra', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Command', exact: true }).click();
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Community', exact: true }).click();
  await tab(page, 'Members').click();
  await expect(page.getByRole('textbox', { name: 'Find members' })).toHaveValue('degra');
});

for (const width of [375, 390, 430, 1024, 1440]) test(`Community and navigation visual checks ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/community');
  await expect(page.getByRole('article')).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `docs/audits/lifeos-ui/screenshots/community-feed-${width}.png` });
  await tab(page, 'Members').click();
  await expect(page.getByRole('button', { name: '@degra', exact: true })).toBeVisible();
  await page.screenshot({ path: `docs/audits/lifeos-ui/screenshots/community-members-${width}.png` });
  if (width < 768) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Your system' });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(240);
    const box = await dialog.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(835);
    expect(box.x).toBeGreaterThanOrEqual(8);
    await page.screenshot({ path: `docs/audits/lifeos-ui/screenshots/more-menu-${width}.png` });
    await page.mouse.click(2, 100);
    await expect(dialog).toBeHidden();
  }
  expect(errors).toEqual([]);
});

for (const width of [390, 1024]) test(`shared record workspace polish ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const workspace of ['health', 'calendar', 'memos', 'finances']) {
    await page.goto(`/${workspace}`);
    await expect(page.locator('.lifeos-shell')).toHaveAttribute('data-workspace', workspace);
    await expect(page.locator('.workspace-content h2').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/audits/lifeos-ui/screenshots/records-${workspace}-${width}.png` });
  }
  expect(errors).toEqual([]);
});
