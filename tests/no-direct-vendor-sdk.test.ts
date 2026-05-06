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
        // v1.2.0 wrappers may import their own SDK (path-allowlisted).
        // RuleTester uses the default espree parser, so we test with the JS
        // syntax form — the TS-only `import type` form is handled by the
        // same AST node (ImportDeclaration) and the rule never inspects
        // import-kind, so the JS test exercises identical behavior.
        {
          code: `import { Twilio } from 'twilio';`,
          filename: '/repo/src/send/twilio.ts',
        },
        {
          code: `import { PlaidApi } from 'plaid';`,
          filename: '/repo/src/send/plaid.ts',
        },
        // persona wrapper uses fetch (no SDK), but if it ever did, it would
        // be exempt by path:
        {
          code: `import 'persona';`,
          filename: '/repo/src/send/persona.ts',
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
        // v1.2.0 vendors — static + dynamic, all flagged
        {
          code: `import twilio from 'twilio';`,
          filename: '/repo/apps/api/src/sms.ts',
          errors: [{ messageId: 'directVendorSdk' }],
        },
        {
          code: `import { PlaidApi } from 'plaid';`,
          filename: '/repo/apps/worker/src/plaid-bypass.ts',
          errors: [{ messageId: 'directVendorSdk' }],
        },
        {
          code: `import 'persona-sdk';`,
          filename: '/repo/apps/api/src/kyc.ts',
          errors: [{ messageId: 'directVendorSdk' }],
        },
        // v1.2.0 — `persona` (real npm pkg) added to denylist alongside the
        // historical `persona-sdk` placeholder.
        {
          code: `import 'persona';`,
          filename: '/repo/apps/api/src/kyc-real.ts',
          errors: [{ messageId: 'directVendorSdk' }],
        },
        // dynamic-import bypass attempts for the new wrappers
        {
          code: `async function f() { const t = await import('twilio'); return t; }`,
          filename: '/repo/apps/api/src/sms-dyn.ts',
          errors: [{ messageId: 'directVendorSdk' }],
        },
        {
          code: `async function f() { const p = await import('plaid'); return p; }`,
          filename: '/repo/apps/api/src/plaid-dyn.ts',
          errors: [{ messageId: 'directVendorSdk' }],
        },
        {
          code: `async function f() { const p = await import('persona'); return p; }`,
          filename: '/repo/apps/api/src/persona-dyn.ts',
          errors: [{ messageId: 'directVendorSdk' }],
        },
      ],
    });
  });
});
