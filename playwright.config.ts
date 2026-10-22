import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: process.env.ATLAS_TEST_URL ?? 'http://127.0.0.1:4173',
    channel: 'chrome',
    viewport: { width: 1536, height: 1100 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
