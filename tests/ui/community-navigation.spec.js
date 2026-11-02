import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('navigation-seeded')) return;
    sessionStorage.setItem('navigation-seeded', 'yes');
    const owner = { user_id: 'qa-user-a', username: 'owner', avatar_url: null, avatar_path: null };
    const author = { user_id: 'qa-user-b', username: 'degra', avatar_url: null, avatar_path: null };
    const members = [owner, author, ...Array.from({ length: 18 }, (_, i) => ({ user_id: `member-${i}`, username: `member_${i}` }))];
    localStorage.setItem('qa-community-members', JSON.stringify(members));
    for (const profile of [owner, author]) localStorage.setItem(`qa-settings:${profile.user_id}`, JSON.stringify({ profile, preferences: { language: 'en', workout_sharing: true, share_workout_notes: false } }));
    localStorage.setItem('qa-community-shares', JSON.stringify([author, owner].map((profile, i) => ({
      id: `share-${i}`, author_id: profile.user_id, author: profile, title: `Workout ${i}`, performed_on: `2026-10-${30 - i}`,
      exercise_count: 1, set_count: 1, exercise_preview: [], sets: [{ exercise: 'Squat', set_number: 1, weight: 50, reps: 8 }],
    }))));
  });
});

const back = page => page.getByRole('button', { name: 'Back', exact: true }).click();
const member = page => page.getByRole('button', { name: '@degra', exact: true }).first().click();
const workout = page => page.getByRole('button', { name: /Workout 0/ }).click();

test('Members origin, search, refresh and browser back/forward survive nested workout navigation', async ({ page }) => {
  await page.goto('/community');
  await page.getByRole('tab', { name: 'Members', exact: true }).click();
  await page.getByRole('textbox', { name: 'Find members' }).fill('degra');
  await expect(page.getByRole('button', { name: '@owner', exact: true })).toHaveCount(0);
  await member(page);
  await expect(page).toHaveURL(/#member=qa-user-b$/);
  await workout(page);
  await expect(page.getByRole('heading', { name: 'Squat', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Squat', exact: true })).toBeVisible();
  await back(page);
  await expect(page).toHaveURL(/#member=qa-user-b$/);
  await back(page);
  await expect(page.getByRole('tab', { name: 'Members', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: 'Find members' })).toHaveValue('degra');
  await page.goForward();
  await expect(page).toHaveURL(/#member=qa-user-b$/);
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Find members' })).toHaveValue('degra');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Find members' })).toHaveValue('degra');
});

test('Feed profile origin and workout-author origin unwind one level at a time', async ({ page }) => {
  await page.goto('/community');
  await member(page);
  await back(page);
  await expect(page.getByRole('tab', { name: 'Feed', exact: true })).toHaveAttribute('aria-selected', 'true');
  await workout(page);
  await member(page);
  await back(page);
  await expect(page.getByRole('heading', { name: 'Squat', exact: true })).toBeVisible();
  await back(page);
  await expect(page.getByRole('tab', { name: 'Feed', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Squat', exact: true })).toBeVisible();
});

for (const hash of ['member=qa-user-b', 'share=share-0', 'share=missing', 'member=missing']) {
  test(`direct ${hash} refresh has a safe Feed fallback`, async ({ page }) => {
    await page.goto('/community#' + hash);
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
    await page.reload();
    await back(page);
    await expect(page.getByRole('tab', { name: 'Feed', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL('/community');
  });
}

test('directory restores scroll and search after profile navigation', async ({ page }) => {
  await page.addInitScript(() => {
    const members = JSON.parse(localStorage.getItem('qa-community-members'));
    members.push(...Array.from({ length: 20 }, (_, i) => ({ user_id: `member-${i + 18}`, username: `member_${i + 18}` })));
    localStorage.setItem('qa-community-members', JSON.stringify(members));
  });
  await page.goto('/community#members');
  await page.getByRole('textbox', { name: 'Find members' }).fill('member_');
  await expect(page.getByRole('button', { name: '@owner', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  const target = page.getByRole('button', { name: '@member_34', exact: true });
  await target.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
  const y = await page.evaluate(() => window.scrollY);
  await target.click();
  await expect(page).toHaveURL(/#member=member-34$/);
  await back(page);
  await expect(page.getByRole('textbox', { name: 'Find members' })).toHaveValue('member_');
  await expect.poll(async () => Math.abs(await page.evaluate(() => window.scrollY) - y)).toBeLessThan(5);
});

test('username-only identities refresh on profile events; only own profile offers Settings', async ({ page }) => {
  await page.goto('/community#member=qa-user-b');
  await expect(page.getByRole('button', { name: 'Public profile', exact: true })).toHaveCount(0);
  await expect(page.getByText('@degra', { exact: true }).first()).toBeVisible();
  await page.evaluate(() => {
    const profiles = JSON.parse(localStorage.getItem('qa-community-members'));
    profiles[1].username = '@renamed';
    localStorage.setItem('qa-community-members', JSON.stringify(profiles));
    window.dispatchEvent(new Event('lifeos:profile-updated'));
  });
  await expect(page.getByText('@renamed', { exact: true })).toBeVisible();
  await expect(page.locator('strong').filter({ hasText: '@renamed' })).toHaveText('@renamed');
  await page.goto('/community#member=qa-user-a');
  await page.getByRole('button', { name: 'Public profile', exact: true }).click();
  await expect(page).toHaveURL('/settings');
});

test('account switch drops navigation/search state and ignores a delayed old feed', async ({ page }) => {
  await page.goto('/community#members');
  await page.getByRole('textbox', { name: 'Find members' }).fill('degra');
  await page.evaluate(() => localStorage.setItem('qa-community-delay', '800'));
  await member(page);
  await page.evaluate(() => {
    localStorage.removeItem('qa-community-delay');
    window.__qaSignIn('qa-user-b');
  });
  await expect(page.getByRole('button', { name: 'Public profile', exact: true })).toBeVisible();
  await back(page);
  await expect(page.getByRole('tab', { name: 'Feed', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Members', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Find members' })).toHaveValue('');
  await page.goBack();
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Find members' })).toHaveValue('');
});

test('revoked detail refresh stays unavailable and exposes no publication actions', async ({ page }) => {
  await page.goto('/community#share=share-0');
  await expect(page.getByRole('heading', { name: 'Squat', exact: true })).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('qa-community-shares', '[]');
    window.dispatchEvent(new Event('lifeos:profile-updated'));
  });
  await expect(page.getByText('This workout is private or unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Stop sharing|Share with Community/ })).toHaveCount(0);
  await back(page);
  await expect(page.getByRole('article')).toHaveCount(0);
});

for (const width of [390, 1024, 1440]) test(`username-only Community layout ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/community');
  await expect(page.getByRole('article')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`community-${width}.png`), fullPage: true });
  await member(page);
  await expect(page.getByRole('article')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`member-${width}.png`), fullPage: true });
});
