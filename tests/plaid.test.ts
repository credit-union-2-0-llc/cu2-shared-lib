/**
 * v1.2.0 — send/plaid wrapper tests
 * cu2-billing W3-01 Task 2
 */
import { describe, it, expect, vi } from 'vitest';
import { createPlaidLinkToken } from '../src/send/plaid.js';
import type { PlaidApi } from 'plaid';

describe('createPlaidLinkToken', () => {
  it('stamps client_user_id = cu-<tenant>-<end_user_ref>', async () => {
    const linkTokenCreate = vi.fn().mockResolvedValue({
      data: { link_token: 'link-sandbox-abc' },
    });
    const fakePlaid = {
      linkTokenCreate,
    } as unknown as PlaidApi;

    const out = await createPlaidLinkToken(
      {
        cu_tenant_id: 'tenant-A',
        end_user_ref: 'app-99',
        products: ['identity_verification'],
        client_name: 'CU2 Billing',
        language: 'en',
        country_codes: ['US'],
        webhookUrl: 'https://example.com/plaid/wh',
      },
      { plaid: fakePlaid },
    );

    expect(out.link_token).toBe('link-sandbox-abc');
    expect(out.client_user_id).toBe('cu-tenant-A-app-99');

    expect(linkTokenCreate).toHaveBeenCalledTimes(1);
    const arg = linkTokenCreate.mock.calls[0][0];
    expect(arg.user.client_user_id).toBe('cu-tenant-A-app-99');
    expect(arg.products).toEqual(['identity_verification']);
    expect(arg.client_name).toBe('CU2 Billing');
    expect(arg.language).toBe('en');
    expect(arg.country_codes).toEqual(['US']);
    expect(arg.webhook).toBe('https://example.com/plaid/wh');
  });

  it('omits webhook when not supplied', async () => {
    const linkTokenCreate = vi
      .fn()
      .mockResolvedValue({ data: { link_token: 'lt' } });
    const fakePlaid = { linkTokenCreate } as unknown as PlaidApi;

    await createPlaidLinkToken(
      {
        cu_tenant_id: 't',
        end_user_ref: 'u',
        products: ['auth'],
        client_name: 'X',
        language: 'en',
        country_codes: ['US'],
      },
      { plaid: fakePlaid },
    );

    const arg = linkTokenCreate.mock.calls[0][0];
    expect('webhook' in arg).toBe(false);
  });

  it('(compile-time): cu_tenant_id is required', () => {
    // @ts-expect-error — cu_tenant_id missing must be a TS error
    const _bad: Parameters<typeof createPlaidLinkToken>[0] = {
      end_user_ref: 'u',
      products: ['auth'],
      client_name: 'X',
      language: 'en',
      country_codes: ['US'],
    };
    expect(true).toBe(true);
  });
});
