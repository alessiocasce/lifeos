import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  timeout: 30000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4178', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/serve-ui-qa.js', url: 'http://127.0.0.1:4178', reuseExistingServer: !process.env.CI },
});
