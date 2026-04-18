/**
 * Template: reusable auth setup for cross-browser Playwright runs.
 *
 * Copy this file to `<project>/tests/e2e/auth.setup.ts` and wire it into
 * `playwright.config.ts` via `setupFile: /auth\.setup\.ts/`.
 *
 * Every matrix project (chromium/firefox/webkit/edge/mobile-ios/mobile-android)
 * will run the setup once and then execute its own specs against the logged-in
 * storage state at `playwright/.auth/user.json`.
 *
 * Customize:
 *   - TEST_EMAIL — swap for your project's QA fixture email
 *   - Selectors — match the app's login form
 *   - The storageState path if your convention differs
 */

import { test as setup, expect } from '@playwright/test';
import { fetchLatestOtp } from '@cu2/shared-lib/testing';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? 'qa@example.test';
const AUTH_STATE = 'playwright/.auth/user.json';

setup('authenticate via OTP', async ({ page, baseURL }) => {
  const apiUrl = (setup.info().config.metadata as { apiUrl?: string })?.apiUrl;
  if (!apiUrl) throw new Error('apiUrl missing from playwright config metadata');

  await page.goto(`${baseURL}/login`);
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByRole('button', { name: /send.*code|continue/i }).click();

  const code = await fetchLatestOtp({ apiUrl, email: TEST_EMAIL });

  await page.getByLabel(/code|one.?time/i).fill(code);
  await page.getByRole('button', { name: /verify|log.?in|sign.?in/i }).click();

  await expect(page).toHaveURL(/\/(dashboard|home|app)/, { timeout: 15_000 });
  await page.context().storageState({ path: AUTH_STATE });
});
