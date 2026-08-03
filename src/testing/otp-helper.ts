/**
 * OTP retrieval helper for E2E login tests.
 *
 * Many CU2 apps use one-time-code (OTP / magic-code) auth instead of password
 * or OAuth. Cross-browser login tests need to read the most recent OTP for a
 * given test email. The canonical pattern:
 *
 *   1. App exposes `GET /test/last-otp/:email` behind a NODE_ENV guard
 *      (returns the most recent code created in the last N seconds).
 *   2. Tests trigger login, then call `fetchLatestOtp` to resolve the code.
 *   3. Tests submit the code and assert the logged-in state.
 *
 * Security: the test endpoint MUST reject all traffic in production. Typical guard:
 *
 *   if (process.env.NODE_ENV === 'production') throw new ForbiddenException();
 *
 * Usage:
 *   import { fetchLatestOtp } from '@cu2/shared-lib/testing';
 *
 *   const code = await fetchLatestOtp({
 *     apiUrl: 'http://localhost:3001',
 *     email: 'qa+chromium@broflo.test',
 *   });
 *   await page.fill('input[name="code"]', code);
 *
 * @requires global fetch (Node 18+)
 */

export interface FetchOtpOptions {
  /** Base URL of the API exposing the test-only OTP endpoint. */
  apiUrl: string;
  /** Email to look up. */
  email: string;
  /**
   * Path of the test-only endpoint. Receives the email as a URL-encoded path
   * segment. Default: `/test/last-otp`.
   * Full URL = `${apiUrl}${endpoint}/${encodeURIComponent(email)}`.
   */
  endpoint?: string;
  /** Max time to wait for the code to appear. Default: 10_000 ms. */
  timeoutMs?: number;
  /** Poll interval while waiting. Default: 500 ms. */
  pollIntervalMs?: number;
  /**
   * JSON field the endpoint returns the code under. Default: `code`.
   * The endpoint may return `{ code: "123456" }` or `{ otp: "123456" }`, etc.
   */
  responseField?: string;
  /** Optional fetch impl (for testing). Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

export class OtpNotFoundError extends Error {
  constructor(email: string, timeoutMs: number, options?: { cause?: unknown }) {
    super(`OTP for ${email} not found within ${timeoutMs}ms`, options);
    this.name = 'OtpNotFoundError';
  }
}

export async function fetchLatestOtp(opts: FetchOtpOptions): Promise<string> {
  const {
    apiUrl,
    email,
    endpoint = '/test/last-otp',
    timeoutMs = 10_000,
    pollIntervalMs = 500,
    responseField = 'code',
    fetchImpl = fetch,
  } = opts;

  const url = `${apiUrl.replace(/\/$/, '')}${endpoint}/${encodeURIComponent(email)}`;
  const deadline = Date.now() + timeoutMs;

  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const res = await fetchImpl(url);
      if (res.ok) {
        const body = (await res.json()) as Record<string, unknown>;
        const code = body[responseField];
        if (typeof code === 'string' && code.length > 0) {
          return code;
        }
      }
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  // lastError (a fetch/network exception from the polling loop) used to be
  // captured and then discarded — both branches threw an identical generic
  // OtpNotFoundError, so a real connectivity/5xx failure was indistinguishable
  // from "the code simply never appeared in time." Surfacing it as `cause`
  // keeps the same thrown type (no behavior change for `instanceof` checks)
  // while making the underlying failure diagnosable.
  throw new OtpNotFoundError(email, timeoutMs, { cause: lastError });
}
