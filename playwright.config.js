import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: true, workers: process.env.CI ? 2 : 3, retries: 0, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4181', browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1000, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: 'node tests/server.mjs', url: 'http://127.0.0.1:4181', reuseExistingServer: false },
});
