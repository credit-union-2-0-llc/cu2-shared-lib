/**
 * v1.1.0 — send/resend wrapper tests
 * cu2-billing W2-01 Task 2 (RED phase tests 5–6)
 */
import { describe, it, expect, vi } from 'vitest';
import { sendResendEmail } from '../src/send/resend.js';

describe('sendResendEmail', () => {
  it('Test 5: passes cu_tenant_id as a Resend tag', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'em_123' }, error: null });
    const fakeResend = { emails: { send } } as unknown as import('resend').Resend;
    const out = await sendResendEmail(
      {
        cu_tenant_id: 'X',
        from: 'a@example.com',
        to: 'b@example.com',
        subject: 'c',
        html: '<p>hi</p>',
      },
      { resend: fakeResend },
    );
    expect(out).toEqual({ id: 'em_123' });
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.tags).toEqual(
      expect.arrayContaining([{ name: 'cu_tenant_id', value: 'X' }]),
    );
  });

  it('Test 6 (compile-time): cu_tenant_id is required', () => {
    // @ts-expect-error — cu_tenant_id missing must be a TS error
    const _bad: Parameters<typeof sendResendEmail>[0] = {
      from: 'a',
      to: 'b',
      subject: 'c',
    };
    // The runtime body of this test is intentionally empty; the assertion is
    // the @ts-expect-error directive above (typecheck enforces the contract).
    expect(true).toBe(true);
  });
});
