import { test, expect } from '@playwright/test';

/**
 * Automated “tour” of this Knowledge Base app.
 *
 * This app does not mirror eFront’s full UI: there is no separate “Access rights”
 * screen. Access-rights guidance comes from your uploaded eFront docs and answers
 * in chat. Use the screenshots from this test to show stakeholders where that
 * happens: home → sign in → chat sidebar (“Add files to eFront”) + message area.
 */
const DEMO_EMAIL = 'demo-access-rights@example.com';

test.describe('Knowledge Base walkthrough', () => {
  test('home → login → chat with tour screenshots', async ({ page }) => {
    await test.step('Home — eFront entry point', async () => {
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: /eFront documents/i }),
      ).toBeVisible();
      await page.screenshot({
        path: 'test-results/tour-01-home.png',
        fullPage: true,
      });
    });

    await test.step('Open eFront chat (login if needed)', async () => {
      await page.getByRole('button', { name: /open efront chat/i }).click();
    });

    await test.step('Demo login', async () => {
      await expect(page).toHaveURL(/\/login/);
      await page.getByLabel(/^email$/i).fill(DEMO_EMAIL);
      await page.getByRole('button', { name: /^continue$/i }).click();
    });

    await test.step('Chat — where uploads + access-rights Q&A live', async () => {
      await expect(page).toHaveURL(/\/chat\//);
      await expect(
        page.getByRole('button', { name: /add files to efront/i }),
      ).toBeVisible();
      await page.screenshot({
        path: 'test-results/tour-02-chat-access-rights-via-docs.png',
        fullPage: true,
      });
    });
  });
});
