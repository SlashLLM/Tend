import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

/** End-to-end tests run against the real local Supabase (pnpm db:start && pnpm db:reset). */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // journeys mutate shared demo data
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: {
    command: `pnpm exec next dev --turbopack --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
    env: { DEMO_MODE: '1', NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}` },
  },
});
