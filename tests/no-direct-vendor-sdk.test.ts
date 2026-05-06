/**
 * v1.1.0 — eslint-rules/no-direct-vendor-sdk tests
 * cu2-billing W2-01 Task 2 (RED phase tests 7–9)
 *
 * Uses ESLint's RuleTester to validate the AST visitor catches:
 *   • static `import 'resend'` outside the wrapper allowlist
 *   • dynamic `await import('resend')` (denylist bypass attempt)
 * and does NOT report when the file IS the wrapper itself.
 */
import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../src/eslint-rules/no-direct-vendor-sdk.js';

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

describe('no-direct-vendor-sdk', () => {
  it('runs RuleTester suite', () => {
    tester.run('no-direct-vendor-sdk', rule, {
      valid: [
        // Test 8: import inside the wrapper itself is allowed
        {
          code: `import { Resend } from 'resend';`,
          filename: '/repo/src/send/resend.ts',
        },
        {
          code: `import { Resend } from 'resend';`,
          filename: '/repo/src/send/resend.js',
        },
        // unrelated imports never trigger
        {
          code: `import { foo } from 'lodash';`,
          filename: '/repo/src/anywhere.ts',
        },
      ],
      invalid: [
        // Test 7: static import outside the wrapper
        {
          code: `import { Resend } from 'resend';`,
          filename: '/repo/apps/api/src/some-feature.ts',
          errors: [{ messageId: 'directVendorSdk' }],
        },
        // Test 9: dynamic-import denylist bypass
        {
          code: `async function f() { const r = await import('resend'); return r; }`,
          filename: '/repo/apps/api/src/dyn.ts',
          errors: [{ messageId: 'directVendorSdk' }],
        },
        // future v1.2.0 vendors are also flagged today (rule lists them already)
        {
          code: `import twilio from 'twilio';`,
          filename: '/repo/apps/api/src/sms.ts',
          errors: [{ messageId: 'directVendorSdk' }],
        },
      ],
    });
  });
});
