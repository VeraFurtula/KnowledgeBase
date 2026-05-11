import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * eFront sets the login form POST target to Login.ashx with dynamic W/H/CW/CH/L query params.
 * Opening Login.ashx with a fixed bookmark often returns 404; start from Login.aspx instead.
 *
 * After each run, open `test-results/efront-login-walkthrough/` for step PNGs (login page,
 * username filled, both fields filled, post-login screen). Set PW_RECORD_VIDEO=1 for a WebM replay.
 */
const DEFAULT_LOGIN_URL =
  'http://frt21jvhxunbw7f7zo5xq.westeurope.cloudapp.azure.com:8081/Login.aspx';

const WALKTHROUGH_DIR = join('test-results', 'efront-login-walkthrough');

async function walkthroughShot(page: Page, filename: string) {
  mkdirSync(WALKTHROUGH_DIR, { recursive: true });
  await page.screenshot({
    path: join(WALKTHROUGH_DIR, filename),
    fullPage: true,
  });
}

test.describe('eFront Azure (remote)', () => {
  test('login with username and password', async ({ page }) => {
    const loginUrl = process.env.EFRONT_AZURE_LOGIN_URL ?? DEFAULT_LOGIN_URL;
    const user = process.env.EFRONT_AZURE_USER ?? '';
    const password = process.env.EFRONT_AZURE_PASSWORD ?? '';

    test.skip(
      !user || !password,
      'Set EFRONT_AZURE_USER and EFRONT_AZURE_PASSWORD (env or e2e-external/.env — see env.example)',
    );

    await test.step('Open login page', async () => {
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
      await expect(page.getByPlaceholder('Username')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByPlaceholder('Password')).toBeVisible();
      await walkthroughShot(page, '01-login-page-ready.png');
    });

    await test.step('Type username', async () => {
      await page.getByPlaceholder('Username').fill(user);
      await walkthroughShot(page, '02-username-filled.png');
    });

    await test.step('Type password', async () => {
      await page.getByPlaceholder('Password').fill(password);
      await walkthroughShot(page, '03-username-and-password-filled.png');
    });

    await test.step('Click Sign in', async () => {
      await page.getByRole('button', { name: /^sign in$/i }).click();
    });

    await test.step('Leave login screen', async () => {
      const usernameField = page.getByPlaceholder('Username');
      await expect(usernameField).not.toBeVisible({ timeout: 120_000 });
      await page.waitForLoadState('domcontentloaded');
      await walkthroughShot(page, '04-after-login.png');
    });
  });
});
