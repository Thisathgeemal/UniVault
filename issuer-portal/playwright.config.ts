/**
 * End-to-end test (`npm run test:e2e`, Chromium only; not part of `npm test`).
 *
 * Starts the real backend on a throwaway embedded database (e2e/start-backend.mjs) and the
 * portal's Vite dev server, on their own ports so a running `npm run dev` is not disturbed.
 * The staff password is random per run and only passed through environment variables.
 */
import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

const BACKEND_PORT = 4100;
const PORTAL_PORT = 5180;
const PORTAL_ORIGIN = `http://localhost:${PORTAL_PORT}`;

// Generated once in the runner; workers inherit it
process.env.UNIVAULT_E2E_PASSWORD ||= `E2e-${randomBytes(12).toString('hex')}!`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: PORTAL_ORIGIN,
    trace: 'retain-on-failure',
    locale: 'en-GB',
    timezoneId: 'Asia/Colombo',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/start-backend.mjs',
      url: `http://localhost:${BACKEND_PORT}/api/v1/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: { E2E_BACKEND_PORT: String(BACKEND_PORT), E2E_PORTAL_ORIGIN: PORTAL_ORIGIN },
    },
    {
      command: `npx vite --port ${PORTAL_PORT} --strictPort`,
      url: PORTAL_ORIGIN,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { VITE_API_BASE_URL: `http://localhost:${BACKEND_PORT}/api/v1` },
    },
  ],
});
