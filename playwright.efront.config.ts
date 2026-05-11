import { defineConfig, devices } from '@playwright/test';
import { loadEfrontEnvFile } from './e2e-external/loadEnvFile';

loadEfrontEnvFile();

/**
 * Tests against the remote eFront demo host (no local Vite).
 * Credentials: set EFRONT_AZURE_USER / EFRONT_AZURE_PASSWORD or create e2e-external/.env
 * Run: npm run test:e2e:efront  (or npm run test:e2e:efront:headed to force a visible window)
 *
 * Local runs use a visible Chromium window (like a separate browser) so you can watch the login.
 * CI (`CI` set) and `PW_HEADLESS=1` use headless. For a dashboard in your browser tab: `npm run test:e2e:efront:ui`.
 * Step PNG walkthrough: `test-results/efront-login-walkthrough/`. Set `PW_RECORD_VIDEO=1` for WebM video.
 * Optional `PW_SLOW_MO` (ms, max 2500) slows each action so UI/headed runs are easier to follow.
 */
const headless =
  !!(process.env.CI || process.env.PW_HEADLESS === "1" || process.env.PW_HEADLESS === "true");

const recordVideo =
  process.env.PW_RECORD_VIDEO === "1" || process.env.PW_RECORD_VIDEO === "true";

const slowMoRaw = Number(process.env.PW_SLOW_MO);
const slowMo =
  Number.isFinite(slowMoRaw) && slowMoRaw > 0 ? Math.min(slowMoRaw, 2500) : undefined;

export default defineConfig({
  testDir: './e2e-external',
  /** Remote eFront login can exceed Playwright’s default 30s. */
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  /**
   * UI mode + HTML reporter together can destabilize the UI WebSocket (steps freeze / “disconnected”).
   * Use `npx playwright show-report` after a normal `test:e2e:efront` run if you need the HTML report.
   */
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /* Must come after spread — Desktop Chrome defaults to headless. */
        headless,
        video: recordVideo ? 'on' : 'off',
        ...(slowMo ? { launchOptions: { slowMo } } : {}),
      },
    },
  ],
});
