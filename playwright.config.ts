import { defineConfig } from '@playwright/test';

const developmentURL = 'http://127.0.0.1:4173';
const externalURL = process.env.ATLAS_TEST_URL || undefined;

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  webServer: externalURL ? undefined : {
    command: 'npm run dev',
    url: `${developmentURL}/health`,
    env: { PORT: '4173' },
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: externalURL ?? developmentURL,
    channel: 'chrome',
    viewport: { width: 1536, height: 1100 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
