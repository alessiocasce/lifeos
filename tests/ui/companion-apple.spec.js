import { test, expect } from '@playwright/test';

const evidence = 'docs/audits/lifeos-ui/screenshots';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('conversation starters prepare an editable draft and composer grows without sending', async ({ page }) => {
  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Think it through', exact: true }).click();
  const input = page.getByTestId('brain-message-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Help me think through a decision: ');
  expect(await page.evaluate(() => localStorage.getItem('qa-brain-requests'))).toBeNull();
  const initialHeight = (await input.boundingBox()).height;
  await input.fill('First line\nSecond line\nThird line');
  expect((await input.boundingBox()).height).toBeGreaterThan(initialHeight);
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  expect(await page.evaluate(() => localStorage.getItem('qa-brain-requests'))).toBeNull();
  await page.getByTestId('brain-send-button').click();
  await expect(page.getByTestId('brain-message-list')).toContainText('Recorded in this test conversation.');
  await page.screenshot({ path: `${evidence}/companion-apple-messages-390.png` });
});

test('context dismissal reverses and retains modal focus until the closing motion completes', async ({ page }) => {
  await page.goto('/assistant');
  const trigger = page.getByRole('button', { name: 'Open Companion context' });
  const dialog = page.getByRole('dialog', { name: 'Companion context' });
  await trigger.click();
  await expect(dialog.getByText('No longer current', { exact: true })).toBeVisible();
  await dialog.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  // Slow only the upcoming dismissal so the interruption test has a reliable window under load.
  await dialog.evaluate(element => { element.getAnimations()[0].playbackRate = .05; });
  await page.keyboard.press('Escape');
  expect(await dialog.evaluate(element => element.open)).toBe(true);
  await dialog.dispatchEvent('pointerdown');
  await expect.poll(() => dialog.evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1);
  expect(await dialog.evaluate(element => element.open && element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

for (const language of ['en', 'it']) {
  test(`Companion remains usable at six widths and larger text in ${language}`, async ({ page }) => {
    await page.addInitScript(language => localStorage.setItem('qa-settings:qa-user-a', JSON.stringify({
      profile: { username: 'qa_user' }, preferences: { language, workout_sharing: true, share_workout_notes: false },
    })), language);
    await page.goto('/assistant');
    for (const width of [360, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const size of ['100%', '200%']) {
        await page.evaluate(size => { document.documentElement.style.fontSize = size; }, size);
        const input = page.getByTestId('brain-message-input');
        await expect(input).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const send = await page.getByTestId('brain-send-button').boundingBox();
        if (width < 768) {
          // Root text changes resize the navigation too. Wait for its measured
          // height to reach the shared layout variable before comparing boxes.
          await expect.poll(() => page.locator('.mobile-dock').evaluate(el => Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lifeos-mobile-dock-height')) - el.getBoundingClientRect().height))).toBe(0);
          const dock = await page.locator('.mobile-dock').boundingBox();
          const settledSend = await page.getByTestId('brain-send-button').boundingBox();
          expect(settledSend.y + settledSend.height).toBeLessThanOrEqual(dock.y);
          await expect.poll(async () => {
            const composer = await page.locator('.companion-composer').boundingBox();
            const navigation = await page.locator('.mobile-dock').boundingBox();
            return composer.y + composer.height <= navigation.y;
          }).toBe(true);
        }
        await page.screenshot({ path: `${evidence}/companion-apple-${language}-${width}-${size === '100%' ? 'normal' : 'large'}.png` });
      }
      await page.getByRole('button', { name: language === 'it' ? 'Apri contesto Companion' : 'Open Companion context' }).click();
      const dialog = page.locator('.companion-context-dialog');
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    }
  });
}

test('reduced motion and solid materials retain feedback and keyboard access', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Open Companion context' }).click();
  const dialog = page.locator('.companion-context-dialog');
  const timing = await dialog.evaluate(element => element.getAnimations()[0].effect.getTiming().duration);
  expect(timing).toBeLessThanOrEqual(100);
  expect(await page.locator('.companion-composer').evaluate(element => getComputedStyle(element).backdropFilter)).toBe('none');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('context can dismiss before its opening animation advances', async ({ page }) => {
  await page.goto('/assistant');
  const trigger = page.getByRole('button', { name: 'Open Companion context' });
  await trigger.click();
  const dialog = page.locator('.companion-context-dialog');
  await dialog.evaluate(element => {
    const animation = element.getAnimations()[0];
    animation.pause();
    animation.currentTime = 0;
  });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
