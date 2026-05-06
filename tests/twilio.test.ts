/**
 * v1.2.0 — send/twilio wrapper tests
 * cu2-billing W3-01 Task 2
 */
import { describe, it, expect, vi } from 'vitest';
import { sendTwilioSms } from '../src/send/twilio.js';
import type { Twilio } from 'twilio';

describe('sendTwilioSms', () => {
  it('forwards body/from/to to twilio.messages.create and echoes cu_tenant_id', async () => {
    const create = vi.fn().mockResolvedValue({ sid: 'SM123' });
    const fakeTwilio = {
      messages: { create },
    } as unknown as Twilio;

    const out = await sendTwilioSms(
      {
        cu_tenant_id: 'tenant-A',
        from: '+15551110000',
        to: '+15552220000',
        body: 'hello',
      },
      { twilio: fakeTwilio },
    );

    expect(out).toEqual({ sid: 'SM123', cu_tenant_id: 'tenant-A' });
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0];
    expect(arg.from).toBe('+15551110000');
    expect(arg.to).toBe('+15552220000');
    expect(arg.body).toBe('hello');
    // mediaUrl should be omitted when no mediaUrls supplied
    expect(arg.mediaUrl).toBeUndefined();
  });

  it('forwards mediaUrls + statusCallback when supplied', async () => {
    const create = vi.fn().mockResolvedValue({ sid: 'SM456' });
    const fakeTwilio = {
      messages: { create },
    } as unknown as Twilio;

    await sendTwilioSms(
      {
        cu_tenant_id: 'tenant-B',
        from: '+1',
        to: '+2',
        body: 'mms',
        mediaUrls: ['https://example.com/a.png'],
        statusCallback: 'https://example.com/cb',
      },
      { twilio: fakeTwilio },
    );

    const arg = create.mock.calls[0][0];
    expect(arg.mediaUrl).toEqual(['https://example.com/a.png']);
    expect(arg.statusCallback).toBe('https://example.com/cb');
  });

  it('(compile-time): cu_tenant_id is required', () => {
    // @ts-expect-error — cu_tenant_id missing must be a TS error
    const _bad: Parameters<typeof sendTwilioSms>[0] = {
      from: '+1',
      to: '+2',
      body: 'x',
    };
    expect(true).toBe(true);
  });
});
