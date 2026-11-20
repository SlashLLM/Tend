import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
/** Hosted Supabase TEST project instead of local Docker: every DB call is a network round trip. */
const REMOTE = process.env.E2E_REMOTE === '1';
/** Production build (`next build && next start`) — what Vercel runs; no per-page dev compilation. */
const PROD = process.env.E2E_PROD === '1';

/**
 * End-to-end tests. Default: local Supabase (pnpm db:start && pnpm db:reset).
 * Hosted test project: see e2e/global-setup.ts. AI runs offline (deterministic) unless E2E_LIVE_AI=1.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: REMOTE ? 180_000 : 90_000,
  expect: { timeout: REMOTE ? 30_000 : 15_000 },
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
    command: PROD ? `pnpm build && pnpm exec next start --port ${PORT}` : `pnpm exec next dev --turbopack --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: PROD ? 600_000 : 180_000,
    stdout: 'pipe', // server errors show up in the test output
    env: {
      DEMO_MODE: '1',
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
      ...(process.env.E2E_LIVE_AI === '1' ? {} : { AI_FORCE_OFFLINE: '1' }),
    },
  },
});
