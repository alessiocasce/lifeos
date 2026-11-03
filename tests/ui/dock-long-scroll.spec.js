import { test, expect } from '@playwright/test';
import { localDate } from '../../src/utils/date.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(today => {
    localStorage.setItem('qa-workouts', JSON.stringify([{
      id: 'dock-session', user_id: 'qa-user-a', name: 'Long workout', performed_on: today,
      started_at: today + 'T08:00:00Z', ended_at: null, template_snapshot: [],
      workout_sets: Array.from({ length: 60 }, (_, i) => ({
        id: 'dock-set-' + i, workout_id: 'dock-session', exercise: 'Long exercise',
        set_number: i + 1, weight: 20, reps: 8, performed_at: today + 'T08:01:00Z',
      })),
    }]));
  }, localDate());
});

const dock = page => page.getByRole('navigation', { name: 'Mobile navigation' });

async function measure(page, label, samples) {
  const sample = await dock(page).evaluate(element => {
    const r = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const blockers = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.transform !== 'none' || style.filter !== 'none' || style.perspective !== 'none'
        || /transform|filter|perspective/.test(style.willChange) || /paint|layout|strict|content/.test(style.contain)) {
        blockers.push(parent.className || parent.tagName);
      }
    }
    return {
      top: r.top, bottom: r.bottom, height: r.height, left: r.left, right: r.right,
      viewportBottom: viewport.offsetTop + viewport.height, scale: viewport.scale,
      scrollY: window.scrollY, blockers,
      hit: element.contains(document.elementFromPoint(r.left + r.width / 2, r.top + 20)),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  samples.push({ label, ...sample });
  expect(sample.blockers).toEqual([]);
  expect(Math.abs(sample.bottom - sample.viewportBottom)).toBeLessThan(1.5);
  expect(sample.height).toBe(68);
  expect(sample.left).toBe(0);
  expect(sample.right).toBe(await page.evaluate(() => innerWidth));
  expect(sample.hit).toBe(true);
  expect(sample.overflow).toBe(false);
  return sample;
}

for (const width of [375, 390, 430]) {
  test('cold lazy Training and long-scroll dock at ' + width, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    // Hold lazy Training so the first measured frame uses only shell CSS.
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/src/tabs/WorkoutTab.jsx*', async route => { await held; await route.continue(); });
    const samples = [];
    try {
      await page.goto('/workout', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Loading workspace...', { exact: true })).toBeVisible();
      await measure(page, 'cold shell before lazy CSS', samples);
      await page.screenshot({ path: info.outputPath('dock-cold.png') });
    } finally { release(); }
    await expect(page.getByRole('button', { name: 'Workout options', exact: true })).toBeVisible();
    await measure(page, 'loaded Training', samples);
    const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    expect(maxScroll).toBeGreaterThan(844 * 3);
    for (const fraction of [0.25, 0.6, 1, 0]) {
      await page.evaluate(y => window.scrollTo(0, y), maxScroll * fraction);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(maxScroll * fraction, 0);
      await measure(page, 'scroll ' + fraction, samples);
      await page.screenshot({ path: info.outputPath('dock-scroll-' + fraction + '.png') });
    }
    for (const height of [640, 900, 844]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await measure(page, 'resized bottom ' + height, samples);
    }
    await page.screenshot({ path: info.outputPath('long-scroll-bottom.png') });
    await dock(page).getByRole('button', { name: 'Command', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await measure(page, 'Command after Training', samples);
    await info.attach('dock-measurements', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
  });
}

test('fixed docks escape transformed app containing blocks', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('.training-dock')).toBeVisible();
  // Fault injection reproduces the fixed-position containing-block failure without
  // changing application CSS or pretending this is real Safari browser chrome.
  await page.locator('#root').evaluate(element => { element.style.transform = 'translate3d(0, 0, 0)'; });
  await page.locator('.lifeos-shell').evaluate(element => {
    element.style.willChange = 'transform';
    element.style.minHeight = '5000px';
  });
  const capturedBottom = await page.locator('.lifeos-shell').evaluate(element => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;bottom:0;width:1px;height:1px';
    element.append(probe);
    const bottom = probe.getBoundingClientRect().bottom;
    probe.remove();
    return bottom;
  });
  expect(capturedBottom).toBeGreaterThan(4000);
  const samples = [];
  for (const y of [0, 1800, 4000, 0]) {
    await page.evaluate(top => window.scrollTo(0, top), y);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y);
    const nav = await measure(page, 'transformed root scroll ' + y, samples);
    const resume = await page.locator('.training-dock').boundingBox();
    expect(resume.y + resume.height).toBeLessThan(nav.top);
    expect(resume.y).toBeGreaterThan(0);
  }
  await page.locator('.training-dock').click();
  await expect(page).toHaveURL(/\/workout$/);
  await info.attach('containing-block-measurements', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
});

test('cancelable local navigation guard preserves tab, scroll and utilities', async ({ page }) => {
  await page.goto('/workout');
  await expect(page.getByRole('button', { name: 'Workout options', exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.scrollTo(0, 1200);
    window.__dockNavigationGuard = event => event.preventDefault();
    document.addEventListener('lifeos:before-navigate', window.__dockNavigationGuard);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1200);
  await dock(page).getByRole('button', { name: 'Command', exact: true }).click();
  await expect(page).toHaveURL(/\/workout$/);
  expect(await page.evaluate(() => window.scrollY)).toBe(1200);
  await dock(page).getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('navigation', { name: 'Utilities' }).getByRole('button', { name: 'Health', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Your system' })).toBeVisible();
  await expect(page).toHaveURL(/\/workout$/);
  await page.evaluate(() => document.removeEventListener('lifeos:before-navigate', window.__dockNavigationGuard));
  await page.getByRole('navigation', { name: 'Utilities' }).getByRole('button', { name: 'Health', exact: true }).click();
  await expect(page).toHaveURL(/\/health$/);
  await expect(page.getByRole('dialog', { name: 'Your system' })).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
