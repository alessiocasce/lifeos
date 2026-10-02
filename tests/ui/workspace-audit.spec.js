import { test, expect } from '@playwright/test';

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932], [1280, 800], [1440, 900], [1920, 1080]]) {
  for (const route of ['/', '/workout', '/projects', '/assistant', '/health', '/calendar', '/memos', '/finances']) {
    test(`workspace controls remain usable at ${width}x${height}: ${route}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.route('**/*', (request) => new URL(request.request().url()).hostname === '127.0.0.1' ? request.continue() : request.abort());
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('navigation', { name: width < 768 ? 'Mobile navigation' : 'Primary navigation', exact: true })).toBeVisible();
      const ready = {
        '/': page.getByRole('button', { name: 'Talk to Companion', exact: true }),
        '/workout': page.getByRole('button', { name: 'Save Set', exact: true }),
        '/projects': page.getByRole('button', { name: 'New Project', exact: true }),
        '/assistant': page.getByTestId('brain-message-input'),
        '/health': page.getByRole('button', { name: 'Log Shower', exact: true }),
        '/calendar': page.getByRole('button', { name: 'New event', exact: true }),
        '/memos': page.getByRole('button', { name: 'Create memo', exact: true }),
        '/finances': page.getByRole('button', { name: 'Save expense', exact: true }),
      };
      await expect(ready[route]).toBeVisible();
      const undersized = await page.locator('button, summary').evaluateAll((elements) => elements.flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        if (!bounds.width || !bounds.height || element.disabled || getComputedStyle(element).visibility === 'hidden') return [];
        if (bounds.height >= 44) return [];
        return [{ label: element.getAttribute('aria-label') || element.textContent.trim(), height: bounds.height }];
      }));
      expect(undersized).toEqual([]);
      const unreadable = await page.locator('.text-zinc-500, .text-zinc-600').evaluateAll((elements) => {
        const rgb = (value) => (value.match(/[\d.]+/g) || []).map(Number);
        const luminance = (color) => color.slice(0, 3).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        return elements.flatMap((element) => {
          if (!element.getBoundingClientRect().height || !element.textContent.trim() || element.closest(':disabled')) return [];
          const colors = [];
          for (let node = element; node; node = node.parentElement) colors.unshift(rgb(getComputedStyle(node).backgroundColor));
          const background = colors.reduce((base, color) => base.map((value, index) => value * (1 - (color[3] ?? 1)) + color[index] * (color[3] ?? 1)), [11, 13, 15]);
          const foreground = luminance(rgb(getComputedStyle(element).color));
          const surface = luminance(background);
          const contrast = (Math.max(foreground, surface) + 0.05) / (Math.min(foreground, surface) + 0.05);
          return contrast >= 4.5 ? [] : [{ text: element.textContent.trim().slice(0, 80), contrast: Number(contrast.toFixed(2)) }];
        });
      });
      expect(unreadable).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      await page.screenshot({ path: info.outputPath('workspace.png'), fullPage: true });
    });
  }
}
