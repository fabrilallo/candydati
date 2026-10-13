import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  outputDir: './.results',
  fullyParallel: true,
  workers: Number(process.env.E2E_WORKERS ?? 2),
  retries: 0,
  globalTimeout: 20 * 60_000,
  forbidOnly: Boolean(process.env.CI),
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: './.report' }]] : [['list']],
  use: {
    baseURL,
    locale: 'it-IT',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    // Tracing records every request; a dev page makes thousands. Opt in with E2E_TRACE=1 when debugging.
    trace: process.env.E2E_TRACE ? 'retain-on-failure' : 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
