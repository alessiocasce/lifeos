import { test, expect } from '@playwright/test';

const dock = page => page.getByRole('navigation', { name: /^(Mobile navigation|Navigazione mobile)$/ });

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Public profile', exact: true })).toBeVisible();
});

for (const language of ['en', 'it']) test(`floating navigation fits all breakpoints in ${language}`, async ({ page }, info) => {
  await page.evaluate(language => localStorage.setItem('qa-settings:qa-user-a', JSON.stringify({ profile: { user_id: 'qa-user-a', username: 'qa_user' }, preferences: { language, workout_sharing: true, share_workout_notes: false } })), language);
  await page.reload();
  for (const width of [360, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    if (width >= 768) { await expect(dock(page)).toBeHidden(); continue; }
    await expect(dock(page)).toBeVisible();
    await expect(dock(page).getByRole('button')).toHaveCount(5);
    await expect(dock(page).locator('[aria-current="page"]')).toHaveCount(1);
    const nav = await dock(page).boundingBox();
    expect(nav.x).toBe(12); expect(nav.x + nav.width).toBe(width - 12); expect(nav.y + nav.height).toBe(832);
    for (const button of await dock(page).getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44);
      expect(await button.locator('.mobile-destination-label').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await expect.poll(async () => {
      const resume = await page.locator('.training-dock').boundingBox();
      return nav.y - resume.y - resume.height;
    }).toBeGreaterThanOrEqual(11);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`dock-${language}-${width}.png`) });
  }
});

test('selection spring retargets its current position and settles on the new route', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-17T12:00:01Z'));
  const pill = dock(page).locator('.mobile-dock-selection');
  const x = () => pill.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
  const start = await x();
  await dock(page).getByRole('button', { name: 'Command', exact: true }).click();
  await page.clock.runFor(80);
  const midway = await x();
  expect(midway).toBeGreaterThan(6); expect(midway).toBeLessThan(start);
  await dock(page).getByRole('button', { name: 'Community', exact: true }).click();
  expect(await x()).toBeCloseTo(midway, 1);
  await page.clock.runFor(1000);
  const target = await dock(page).getByRole('button', { name: 'Community', exact: true }).evaluate(el => el.offsetLeft);
  expect(await x()).toBeCloseTo(target, 1);
  await expect(page).toHaveURL(/\/community$/);
});

test('press feedback cancels on drag-away; reduced motion and More focus remain clear', async ({ page }) => {
  const community = dock(page).getByRole('button', { name: 'Community', exact: true });
  const box = await community.boundingBox();
  const initial = await community.evaluate(el => getComputedStyle(el).backgroundColor);
  await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down();
  expect(await community.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(initial);
  await page.mouse.move(1, 1); await page.mouse.up();
  await expect(page).toHaveURL(/\/settings$/);
  await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
  await community.click();
  const offset = await community.evaluate(el => el.offsetLeft);
  expect(await dock(page).locator('.mobile-dock-selection').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41)).toBe(offset);
  expect(await dock(page).evaluate(el => getComputedStyle(el).backdropFilter)).toBe('none');
  const more = dock(page).getByRole('button', { name: 'More', exact: true });
  await more.click(); await expect(more).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Close utilities', exact: true }).click();
  await expect(more).toBeFocused();
});

test('larger text grows the dock and reserves room above both bars', async ({ page }) => {
  for (const language of ['en', 'it']) {
    await page.evaluate(language => localStorage.setItem('qa-settings:qa-user-a', JSON.stringify({ profile: { user_id: 'qa-user-a', username: 'qa_user' }, preferences: { language, workout_sharing: true, share_workout_notes: false } })), language);
    await page.reload();
    await expect(page.locator('#settings-notes')).toBeVisible();
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => document.documentElement.style.fontSize = '200%');
      await expect.poll(() => dock(page).evaluate(el => el.offsetHeight)).toBeGreaterThan(72);
      await expect.poll(async () => {
        const nav = await dock(page).boundingBox();
        const resume = await page.locator('.training-dock').boundingBox();
        return nav.y - resume.y - resume.height;
      }).toBeGreaterThanOrEqual(11);
      for (const button of await dock(page).getByRole('button').all()) {
        expect(await button.locator('.mobile-destination-label').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('#settings-notes').scrollIntoViewIfNeeded();
      const notes = await page.locator('#settings-notes').boundingBox();
      const resume = await page.locator('.training-dock').boundingBox();
      expect(notes.y + notes.height).toBeLessThan(resume.y);
    }
  }
});
