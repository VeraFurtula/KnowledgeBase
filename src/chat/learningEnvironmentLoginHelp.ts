const DEFAULT_LEARNING_LOGIN_URL =
  "http://frt21jvhxunbw7f7zo5xq.westeurope.cloudapp.azure.com:8081/Login.aspx";

/** Login entry used by the in-chat button and Playwright; override with `VITE_EFRONT_LEARNING_LOGIN_URL`. */
export function getLearningEnvironmentLoginUrl(): string {
  const fromEnv = import.meta.env.VITE_EFRONT_LEARNING_LOGIN_URL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_LEARNING_LOGIN_URL;
}

export const LEARNING_ENVIRONMENT_LOGIN_CTA_LABEL = "Open learning environment login";

export function getLearningEnvironmentLoginCta(): { label: string; href: string } {
  return {
    label: LEARNING_ENVIRONMENT_LOGIN_CTA_LABEL,
    href: getLearningEnvironmentLoginUrl(),
  };
}

/** Detects questions about logging into the hosted eFront learning / demo environment and running the automated login test. */
export function isLearningEnvironmentLoginHelpRequest(text: string): boolean {
  const t = text.toLowerCase();
  const learningEnv =
    /\blearning\s+environment\b/.test(t) || /\blearning\s+env\b/.test(t);
  if (!learningEnv) return false;
  const asksAction =
    /\b(can you|could you|please|help me|how do i|how to|open|launch|go to|visit)\b/.test(
      t,
    ) ||
    (/\b(run|execute|start)\b/.test(t) && /\b(test|playwright|e2e)\b/.test(t));
  const loginish = /\b(login|sign in|log in|authenticate)\b/.test(t);
  return asksAction || loginish || /\btest\b/.test(t);
}

export function buildLearningEnvironmentLoginHelpReply(): string {
  return [
    "### Learning environment login",
    "",
    "Use **Open learning environment login** below to open the eFront sign-in page in a **new browser tab**.",
    "",
    "While you run **`npm run dev`** on this project, the same click also tells the dev server to **start the Playwright eFront login test** in the background on your computer (`playwright.efront.config.ts`). It does nothing in production builds or `vite preview`.",
    "",
    "You can always run the suite manually:",
    "",
    "```",
    "npm run test:e2e:efront",
    "```",
    "",
    "To **always** watch the test in a real browser window (even if something set headless), use:",
    "",
    "```",
    "npm run test:e2e:efront:headed",
    "```",
    "",
    "Locally `npm run test:e2e:efront` usually opens a **visible Chromium** window too (separate from your app). CI uses headless; on your PC you can force headless with `PW_HEADLESS=1`.",
    "",
    "**Step-by-step pictures:** each run writes PNGs under `test-results/efront-login-walkthrough/` — empty form, after username, after password, then the screen **after** login. Open that folder in File Explorer after `npm run test:e2e:efront`. For a screen recording, set `PW_RECORD_VIDEO=1` in the environment (adds a WebM under `test-results/`).",
    "",
    "To drive tests from a **browser tab** (Playwright’s UI with timeline + the live page): `npm run test:e2e:efront:ui` — the terminal prints **Listening on http://127.0.0.1:** plus a port (auto-picked to avoid “port already in use”). Open that full URL, not `localhost`, if the tab does not open.",
    "",
    "### Inside Playwright UI — watch the login on the page",
    "",
    "- The middle **preview** starts as **about:blank** until the first navigation runs; after a moment you should see the eFront login page, then typing and **Sign in**.",
    "- Open the **Actions** tab on the left (not only **Source**). There you see each step (`goto`, `fill`, `click`, …). **Click a step** to jump the preview to that moment.",
    "- Use the **timeline** at the top after the run finishes to scrub back and replay the filmstrip.",
    "- To slow the browser so each action is obvious, set **`PW_SLOW_MO=400`** (milliseconds) in your environment or in `e2e-external/.env`, then run UI or headed again.",
    "- For the clearest “movie” of typing in a normal window: **`npm run test:e2e:efront:headed`**.",
    "- To step **manually** (pause between actions): **`npm run test:e2e:efront:debug`** (Playwright Inspector).",
    "",
    "### If UI mode shows “disconnected” or no test steps",
    "",
    "- After any UI server restart, use the new **Listening on http://127.0.0.1:…** URL with **no** stale `?ws=` query string (or stop with Ctrl+C and run `npm run test:e2e:efront:ui` again). Stale `ws=` links break reconnection.",
    "- Repos under **OneDrive / heavy sync folders** can confuse file watchers and drop the UI socket — try copying the project to a normal folder (e.g. `C:\\dev\\…`) if disconnects persist.",
    "- Run `npx playwright install` after `npm update @playwright/test` so browser binaries match.",
    "",
    "First time only (Chromium): `npx playwright install chromium`",
    "",
    "### Credentials (never commit)",
    "",
    "Copy `e2e-external/env.example` to `e2e-external/.env` and set `EFRONT_AZURE_USER` and `EFRONT_AZURE_PASSWORD`, or set those variables in your shell / pipeline secrets.",
    "",
    "### URL note",
    "",
    "Use **`…/Login.aspx`** (or the button) so the form can set the correct `Login.ashx` action. A saved `Login.ashx?…` bookmark often returns 404.",
    "",
    "Optional: set `VITE_EFRONT_LEARNING_LOGIN_URL` in `.env.local` if the learning host URL changes.",
  ].join("\n");
}
