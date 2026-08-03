/**
 * SendGrid email sender.
 *
 * Extracted from: trendforge-orchestration/src/services/notifications/sendgrid.ts
 *
 * Usage:
 *   import { createSendGridClient } from '@cu2/shared-lib/notifications/sendgrid';
 *
 *   const email = createSendGridClient({
 *     apiKey: process.env.SENDGRID_API_KEY!,
 *     fromEmail: 'noreply@myapp.com',
 *   });
 *
 *   await email.send({
 *     to: 'user@example.com',
 *     subject: 'Welcome',
 *     html: '<h1>Hello</h1>',
 *   });
 */

export interface SendGridOptions {
  /** SendGrid API key. If missing, emails are skipped with a warning. */
  apiKey?: string;
  /** Default from address */
  fromEmail: string;
  /** Default from name */
  fromName?: string;
  /** Logger */
  logger?: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain text fallback. Auto-generated from html if omitted. */
  text?: string;
  /** Override from address for this message */
  from?: string;
}

export interface SendGridClient {
  send: (msg: EmailMessage) => Promise<boolean>;
}

export function createSendGridClient(opts: SendGridOptions): SendGridClient {
  const log = opts.logger ?? console;
  let sgMail: { setApiKey: (key: string) => void; send: (msg: unknown) => Promise<unknown> } | null = null;

  if (opts.apiKey) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@sendgrid/mail');
      sgMail = mod.default ?? mod;
      sgMail!.setApiKey(opts.apiKey);
    } catch {
      log.warn('SendGrid module not installed — install @sendgrid/mail');
    }
  }

  async function send(msg: EmailMessage): Promise<boolean> {
    if (!sgMail || !opts.apiKey) {
      log.warn('SendGrid not configured — skipping email');
      return false;
    }

    try {
      await sgMail.send({
        to: msg.to,
        from: msg.from ?? (opts.fromName
          ? { email: opts.fromEmail, name: opts.fromName }
          : opts.fromEmail),
        subject: msg.subject,
        html: msg.html,
        text: msg.text ?? msg.html.replace(/<[^>]+>/g, ''),
      });
      log.info('Email sent', { to: msg.to, subject: msg.subject });
      return true;
    } catch (err) {
      log.error('Failed to send email', { to: msg.to, error: String(err) });
      return false;  // theater-ok: documented `boolean` return contract — the caller can and must check the result; changing this to throw would be a breaking change for every consumer of this shared client
    }
  }

  return { send };
}
