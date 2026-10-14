import { defineConfig, devices } from '@playwright/test';

/**
 * Captures the README screenshots against a running stack (`pnpm --filter @tt/e2e screenshots`). Separate from the
 * suite on purpose: it lives outside `tests/`, so `playwright test` and CI never pick it up.
 */
export default defineConfig({
  testDir: './screenshots',
  testMatch: '*.shoot.ts',
  outputDir: './.results/screenshots',
  workers: 1,
  retries: 0,
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    colorScheme: 'light',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    trace: 'off',
  },
});
