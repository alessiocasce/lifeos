import { test, expect } from '@playwright/test';

// Dates are relative to the real Europe/Rome day so section headings stay meaningful.
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('community-apple')) return;
    sessionStorage.setItem('community-apple', 'yes');
    const language = new URL(location.href).searchParams.get('language') || 'en';
    const owner = { user_id: 'qa-user-a', username: 'casce' };
    const author = { user_id: 'qa-user-b', username: 'degra_training' };
    const members = [owner, author, ...Array.from({ length: 6 }, (_, i) => ({ user_id: `member-${i}`, username: `member_${i}` }))];
    localStorage.setItem('qa-community-members', JSON.stringify(members));
    for (const profile of [owner, author]) localStorage.setItem(`qa-settings:${profile.user_id}`, JSON.stringify({ profile, preferences: { language, workout_sharing: true, share_workout_notes: true } }));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
    const daysBefore = days => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - days); return date.toISOString().slice(0, 10); };
    const sets = ['Custom press', 'Custom row', 'Custom squat', 'Custom hinge'].flatMap((exercise, index) => [
      { exercise, set_number: 1001, weight: 20, reps: 12, rpe: null, is_warmup: true },
      { exercise, set_number: 1, weight: index ? 42.5 : null, reps: 8, rpe: [8, 6, 10, 9][index], notes: index === 0 ? 'Steady tempo' : null },
    ]);
    localStorage.setItem('qa-workouts', '[]');
    localStorage.setItem('qa-community-shares', JSON.stringify([0, 1, 3, 40].map((days, index) => ({
      id: `apple-${index}`, author, author_id: author.user_id, title: index === 0 ? 'Strength and control' : `Training session ${index + 1}`,
      performed_on: daysBefore(days), sets, notes: 'A focused session.', exercise_count: 4, set_count: 8,
      exercise_preview: sets.filter((_, i) => i % 2 === 0).slice(0, 3),
    }))));
  });
});

const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

test('Feed shows spaced cards with author, date and counts beside the title', async ({ page }) => {
  await page.goto('/community');
  await expect(page.getByRole('article')).toHaveCount(4);
  await expect(page.locator('.community-post-date')).toHaveText(['Today', 'Yesterday', /\d/, /\d/]);
  const first = page.getByRole('article').first();
  await expect(first.getByRole('heading', { level: 3 })).toHaveText('Strength and control');
  await expect(first.locator('.community-post-line > .community-post-meta')).toHaveText('4 exercises');
  await expect(first.locator('.community-author-name')).toHaveText('@degra_training');
  await expect(first.getByRole('listitem')).toHaveCount(4);
  await expect(first.getByRole('listitem')).toHaveText(['Custom press2 sets', 'Custom row2 sets', 'Custom squat2 sets', 'Custom hinge2 sets']);
  await expect(first.getByRole('button', { name: 'Strength and control View workout', exact: true })).toBeVisible();
  // Tapping card space outside the author opens the workout.
  const box = await first.boundingBox();
  await page.mouse.click(box.x + box.width - 12, box.y + box.height - 8);
  await expect(page).toHaveURL(/#share=apple-0$/);
  await page.goBack();
  // The author button stays above the row-wide open target.
  await first.getByRole('button', { name: '@degra_training', exact: true }).click();
  await expect(page).toHaveURL(/#member=qa-user-b$/);
});

test('summary-only feed cards include every exercise without loading workout detail', async ({ page }) => {
  await page.goto('/community');
  await page.evaluate(() => {
    const shares = JSON.parse(localStorage.getItem('qa-community-shares'));
    for (const share of shares) {
      delete share.sets;
      share.exercise_summary = [
        { exercise: 'Lat machine', exercise_id: null, set_count: 3 },
        { exercise: 'Pulley', exercise_id: null, set_count: 4 },
        { exercise: 'Curl', exercise_id: null, set_count: 1 },
        { exercise: 'Fourth exercise', exercise_id: null, set_count: 2 },
      ];
    }
    localStorage.setItem('qa-community-shares', JSON.stringify(shares));
  });
  await page.reload();
  const first = page.getByRole('article').first();
  await expect(first.getByRole('listitem')).toHaveText(['Lat machine3 sets', 'Pulley4 sets', 'Curl1 set', 'Fourth exercise2 sets']);
  const alignment = await first.evaluate(card => {
    const count = card.querySelector('.community-post-line > .community-post-meta');
    const line = card.querySelector('.community-post-line');
    const name = card.querySelector('.community-author-name');
    return { countRight: count.getBoundingClientRect().right, lineRight: line.getBoundingClientRect().right,
      nameWeight: getComputedStyle(name).fontWeight };
  });
  expect(Math.abs(alignment.countRight - alignment.lineRight)).toBeLessThan(1);
  expect(alignment.nameWeight).toBe('400');
});

test('segmented control follows the tabs pattern and keeps one indicator', async ({ page }) => {
  await page.goto('/community');
  const feed = page.getByRole('tab', { name: 'Feed', exact: true });
  await feed.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Members', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Members', exact: true })).toBeFocused();
  await expect(page.locator('.community-segments')).toHaveAttribute('style', /--segment-index: 1/);
  await expect(page.locator('.community-segment-thumb')).toHaveCount(1);
  await page.keyboard.press('Home');
  await expect(feed).toHaveAttribute('aria-selected', 'true');
});

test('workout detail leads with the author, then title and date, then set tables', async ({ page }) => {
  await page.goto('/community');
  await page.getByRole('button', { name: /Strength and control/ }).click();
  await expect(page.getByRole('heading', { name: 'Strength and control', level: 2 })).toBeVisible();
  const back = page.getByRole('button', { name: 'Back to Feed', exact: true });
  await expect(back).toHaveText('Feed');
  await expect(page.locator('.community-detail-head > *').first()).toHaveAttribute('aria-label', '@degra_training');
  await expect(page.locator('.community-detail-date')).toBeVisible();
  await expect(page.getByRole('definition')).toHaveCount(0);
  await expect(page.getByText('A focused session.', { exact: true })).toBeVisible();
  const press = page.getByRole('region', { name: 'Custom press' });
  await expect(press.getByText(/\d+ sets?$/)).toHaveCount(0);
  await expect(press.getByRole('columnheader')).toHaveText(['Set', 'Weight', 'Reps', 'RPE']);
  await expect(press.getByRole('row').nth(1).getByRole('cell')).toHaveText(['W', '20 kg', '12', '—']);
  await expect(press.getByRole('row').nth(2).getByRole('cell')).toHaveText(['1', '—', '8', '8']);
  await expect(press.locator('.community-rpe-hard')).toHaveText('8');
  // RPE colour bands: 6-7 green, 8-9 yellow, 10 red.
  await expect(page.getByRole('region', { name: 'Custom row' }).locator('.community-rpe-easy')).toHaveText('6');
  await expect(page.getByRole('region', { name: 'Custom squat' }).locator('.community-rpe-max')).toHaveText('10');
  await expect(press.getByText('Steady tempo', { exact: true })).toBeVisible();
  // Returning focuses the row that opened the workout.
  await back.click();
  await expect(page.getByRole('button', { name: /Strength and control/ })).toBeFocused();
});

test('profile hero, matching feed cards and no edit button on your own profile', async ({ page }) => {
  await page.goto('/community#members');
  await page.getByRole('button', { name: '@degra_training', exact: true }).click();
  await expect(page.getByRole('heading', { name: '@degra_training', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to Members', exact: true })).toHaveText('Members');
  await expect(page.getByRole('article').first().getByRole('button', { name: '@degra_training', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Training session 2/ }).click();
  await expect(page.getByRole('button', { name: 'Back to profile', exact: true })).toHaveText('Profile');
  await page.goto('/community#members');
  await page.getByRole('button', { name: '@casce', exact: true }).click();
  await expect(page.getByRole('heading', { name: '@casce', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toHaveCount(0);
});

test('member list is one plain list with search, clear and no-results recovery', async ({ page }) => {
  await page.goto('/community#members');
  await expect(page.getByRole('list', { name: 'Members' })).toHaveCount(1);
  await expect(page.locator('.community-directory h2')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '@casce', exact: true })).toContainText('You');
  const search = page.getByRole('textbox', { name: 'Find members', exact: true });
  await search.fill('nobody');
  await expect(page.getByText('No matching members.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).last().click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await search.fill('member_1');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await search.press('Escape');
  await expect(search).toHaveValue('');
});

for (const language of ['en', 'it']) for (const width of [360, 390, 430, 768, 1024, 1440]) {
  test(`layout ${language} ${width} at normal and 200% text`, async ({ page }, info) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/community?language=${language}`);
    for (const size of [16, 32]) {
      await page.evaluate(size => { document.documentElement.style.fontSize = `${size}px`; }, size);
      await expect(page.getByRole('article')).toHaveCount(4);
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`feed-${size}.png`), fullPage: true });
      await page.getByRole('button', { name: /Strength and control/ }).click();
      await expect(page.getByRole('table')).toHaveCount(4);
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`workout-${size}.png`), fullPage: true });
      await page.getByRole('button', { name: '@degra_training', exact: true }).click();
      await expect(page.getByRole('heading', { name: '@degra_training' })).toBeVisible();
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`profile-${size}.png`), fullPage: true });
      await page.goto(`/community?language=${language}`);
    }
    expect(errors).toEqual([]);
  });
}
