/**
 * Template: cross-browser OTP login smoke test.
 *
 * Copy to `<project>/tests/e2e/login-otp.spec.ts`. Runs against every project
 * in the configured matrix (Chromium, Firefox, WebKit, Edge, Mobile iOS,
 * Mobile Android) and validates the full click → trigger → code → login flow.
 *
 * Expects:
 *   - A login page at `/login` with email + code fields
 *   - A test-only endpoint `GET /test/last-otp/:email` returning `{ code }`,
 *     gated by `NODE_ENV !== 'production'`
 */

import { test, expect } from '@playwright/test';
import { fetchLatestOtp } from '@cu2/shared-lib/testing';

test.describe('OTP login — cross-browser', () => {
  test('user can request a code and complete login', async ({ page, baseURL }) => {
    const apiUrl = (test.info().config.metadata as { apiUrl?: string })?.apiUrl;
    if (!apiUrl) throw new Error('apiUrl missing from playwright config metadata');

    const email = `qa+${test.info().project.name}@example.test`;

    await page.goto(`${baseURL}/login`);
    await expect(page.getByLabel(/email/i)).toBeVisible();

    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /send.*code|continue/i }).click();

    await expect(page.getByLabel(/code|one.?time/i)).toBeVisible({ timeout: 10_000 });

    const code = await fetchLatestOtp({ apiUrl, email });
    expect(code).toMatch(/^\d{4,8}$/);

    await page.getByLabel(/code|one.?time/i).fill(code);
    await page.getByRole('button', { name: /verify|log.?in|sign.?in/i }).click();

    await expect(page).toHaveURL(/\/(dashboard|home|app)/, { timeout: 15_000 });
  });
});
