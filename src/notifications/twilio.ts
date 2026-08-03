/**
 * Twilio SMS sender.
 *
 * Extracted from: cugiftbot/src/app/api/gift/send-link/route.ts
 *
 * Usage:
 *   import { createTwilioClient } from '@cu2/shared-lib/notifications/twilio';
 *
 *   const sms = createTwilioClient({
 *     accountSid: process.env.TWILIO_ACCOUNT_SID!,
 *     authToken: process.env.TWILIO_AUTH_TOKEN!,
 *     fromNumber: process.env.TWILIO_FROM_NUMBER!,
 *   });
 *
 *   await sms.send({ to: '+15551234567', body: 'Hello!' });
 */

export interface TwilioOptions {
  accountSid: string;
  authToken: string;
  /** Default from number (E.164 format, e.g. +15551234567) */
  fromNumber: string;
  /** Logger */
  logger?: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
}

export interface SmsMessage {
  /** Recipient phone number (E.164 format) */
  to: string;
  /** Message body */
  body: string;
  /** Override from number for this message */
  from?: string;
}

export interface TwilioClient {
  send: (msg: SmsMessage) => Promise<{ sid: string } | null>;
}

export function createTwilioClient(opts: TwilioOptions): TwilioClient {
  const log = opts.logger ?? console;

  async function send(msg: SmsMessage): Promise<{ sid: string } | null> {
    try {
      const twilio = (await import('twilio')).default;
      const client = twilio(opts.accountSid, opts.authToken);
      const result = await client.messages.create({
        to: msg.to,
        from: msg.from ?? opts.fromNumber,
        body: msg.body,
      });
      log.info('SMS sent', { to: msg.to, sid: result.sid });
      return { sid: result.sid };
    } catch (err) {
      log.error('Failed to send SMS', { to: msg.to, error: String(err) });
      return null;  // theater-ok: documented `{ sid } | null` return contract — the caller can and must check for null; changing this to throw would be a breaking change for every consumer of this shared client
    }
  }

  return { send };
}

/**
 * Format a 10-digit US phone number to E.164.
 *   '5551234567' → '+15551234567'
 */
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}
