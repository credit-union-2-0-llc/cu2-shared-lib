/**
 * Stripe webhook verification and routing.
 *
 * Extracted from: cugiftbot/src/lib/stripe.ts + resistance-wine webhook patterns
 *
 * Usage:
 *   import { createWebhookHandler } from '@cu2/shared-lib/payments/stripe-webhooks';
 *
 *   const handler = createWebhookHandler({
 *     secretKey: process.env.STRIPE_SECRET_KEY!,
 *     webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
 *   });
 *
 *   // Express
 *   app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
 *     const event = handler.verifyEvent(req.body, req.headers['stripe-signature']!);
 *     await handler.route(event, {
 *       'checkout.session.completed': async (data) => { ... },
 *       'customer.subscription.deleted': async (data) => { ... },
 *     });
 *     res.json({ received: true });
 *   });
 *
 *   // Next.js App Router
 *   export async function POST(req) {
 *     const rawBody = await req.text(); // CRITICAL: read raw body before JSON parsing
 *     const signature = req.headers.get('stripe-signature');
 *     const event = handler.verifyEvent(rawBody, signature);
 *     ...
 *   }
 */

import type Stripe from 'stripe';

export interface WebhookHandlerOptions {
  /** Stripe secret key */
  secretKey: string;
  /** Stripe webhook signing secret */
  webhookSecret: string;
  /** Logger */
  logger?: {
    log: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
}

export type EventHandlerMap = Record<
  string,
  (data: Record<string, unknown>, event: Stripe.Event) => Promise<void>
>;

export interface WebhookHandler {
  /** Verify webhook signature and parse event. Throws on invalid signature. */
  verifyEvent: (rawBody: string | Buffer, signature: string) => Stripe.Event;
  /** Route an event to the matching handler. Unhandled event types are logged and skipped. */
  route: (event: Stripe.Event, handlers: EventHandlerMap) => Promise<void>;
  /** Access the underlying Stripe instance. */
  getStripe: () => Stripe;
}

export function createWebhookHandler(opts: WebhookHandlerOptions): WebhookHandler {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StripeClass = require('stripe').default ?? require('stripe');
  const stripe: Stripe = new StripeClass(opts.secretKey);
  const log = opts.logger ?? console;

  function verifyEvent(rawBody: string | Buffer, signature: string): Stripe.Event {
    return stripe.webhooks.constructEvent(rawBody, signature, opts.webhookSecret);
  }

  async function route(event: Stripe.Event, handlers: EventHandlerMap): Promise<void> {
    log.log(`Stripe event: ${event.type} (${event.id})`);

    const handler = handlers[event.type];
    if (!handler) {
      log.log(`Unhandled Stripe event: ${event.type}`);
      return;
    }

    await handler(event.data.object as Record<string, unknown>, event);
  }

  return { verifyEvent, route, getStripe: () => stripe };
}

/**
 * Map Stripe PaymentIntent status to a simpler internal status.
 */
export function mapStripeStatus(stripeStatus: string): string {
  const map: Record<string, string> = {
    requires_payment_method: 'pending',
    requires_confirmation: 'pending',
    requires_action: 'requires_action',
    processing: 'processing',
    requires_capture: 'processing',
    canceled: 'failed',
    succeeded: 'captured',
  };
  return map[stripeStatus] ?? 'pending';
}
