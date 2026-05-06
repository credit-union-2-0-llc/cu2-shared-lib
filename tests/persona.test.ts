/**
 * v1.2.0 — send/persona wrapper tests
 * cu2-billing W3-01 Task 2
 */
import { describe, it, expect, vi } from 'vitest';
import { createPersonaInquiry } from '../src/send/persona.js';

describe('createPersonaInquiry', () => {
  it('throws when no template registered for cu_tenant_id', async () => {
    await expect(
      createPersonaInquiry(
        {
          cu_tenant_id: 'tenant-X',
          user_ref: 'u1',
          template_map: { 'tenant-Y': ['itmpl_y'] },
        },
        { apiKey: 'sk_test' },
      ),
    ).rejects.toThrow(/no Persona template registered for cu_tenant_id='tenant-X'/);
  });

  it('stamps reference-id = cu-<tenant>-<user_ref> and selects first template', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      json: async () => ({ data: { id: 'inq_123' } }),
    } as unknown as Response);

    const out = await createPersonaInquiry(
      {
        cu_tenant_id: 'tenant-A',
        user_ref: 'member-42',
        template_map: { 'tenant-A': ['itmpl_first', 'itmpl_second'] },
      },
      { apiKey: 'sk_test', fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(out.inquiry_id).toBe('inq_123');
    expect(out.reference_id).toBe('cu-tenant-A-member-42');
    expect(out.inquiry_template_id).toBe('itmpl_first');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.data.attributes['reference-id']).toBe('cu-tenant-A-member-42');
    expect(body.data.attributes['inquiry-template-id']).toBe('itmpl_first');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer sk_test',
    });
  });

  it('throws on non-2xx Persona response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'bad token',
    } as unknown as Response);

    await expect(
      createPersonaInquiry(
        {
          cu_tenant_id: 'tenant-A',
          user_ref: 'u1',
          template_map: { 'tenant-A': ['itmpl_x'] },
        },
        { apiKey: 'sk_test', fetchImpl: fetchImpl as unknown as typeof fetch },
      ),
    ).rejects.toThrow(/Persona API 401: bad token/);
  });

  it('(compile-time): cu_tenant_id is required', () => {
    // @ts-expect-error — cu_tenant_id missing must be a TS error
    const _bad: Parameters<typeof createPersonaInquiry>[0] = {
      user_ref: 'u',
      template_map: {},
    };
    expect(true).toBe(true);
  });
});
