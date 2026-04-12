/**
 * Stripe Checkout + Subscription management.
 *
 * Extracted from: broflo/apps/api/src/billing/billing.service.ts
 *
 * Usage:
 *   import { createStripeCheckout } from '@cu2/shared-lib/payments/stripe-checkout';
 *
 *   const billing = createStripeCheckout({
 *     secretKey: process.env.STRIPE_SECRET_KEY!,
 *     webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
 *     webUrl: process.env.WEB_URL!,
 *     priceTierMap: {
 *       [process.env.STRIPE_PRO_PRICE_ID!]: 'pro',
 *       [process.env.STRIPE_ELITE_PRICE_ID!]: 'elite',
 *     },
 *   });
 *
 *   const { url } = await billing.createCheckoutSession(customerId, priceId, userId);
 */

import type Stripe from 'stripe';

export interface StripeCheckoutOptions {
  /** Stripe secret key */
  secretKey: string;
  /** Base URL for success/cancel redirects */
  webUrl: string;
  /** Map Stripe price IDs to internal tier names */
  priceTierMap?: Record<string, string>;
  /** Stripe API version override */
  apiVersion?: string;
  /** Logger */
  logger?: { log: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
}

export interface CheckoutResult {
  url: string;
  sessionId: string;
}

export interface StripeCheckoutClient {
  getOrCreateCustomer: (email: string, name?: string, metadata?: Record<string, string>) => Promise<string>;
  createCheckoutSession: (customerId: string, priceId: string, metadata?: Record<string, string>) => Promise<CheckoutResult>;
  createPortalSession: (customerId: string, returnPath?: string) => Promise<{ url: string }>;
  tierFromPriceId: (priceId: string | undefined) => string;
  getStripe: () => Stripe;
}

export function createStripeCheckout(opts: StripeCheckoutOptions): StripeCheckoutClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StripeClass = require('stripe').default ?? require('stripe');
  const stripe: Stripe = new StripeClass(opts.secretKey);
  const log = opts.logger ?? console;

  async function getOrCreateCustomer(
    email: string,
    name?: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length > 0) return existing.data[0].id;

    const customer = await stripe.customers.create({
      email,
      name: name ?? undefined,
      metadata: metadata ?? {},
    });
    return customer.id;
  }

  async function createCheckoutSession(
    customerId: string,
    priceId: string,
    metadata?: Record<string, string>,
  ): Promise<CheckoutResult> {
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${opts.webUrl}/billing?success=true`,
      cancel_url: `${opts.webUrl}/upgrade?canceled=true`,
      subscription_data: { metadata: metadata ?? {} },
      payment_method_collection: 'always',
    });

    if (!session.url) {
      throw new Error('Stripe returned no checkout URL');
    }

    log.log(`Checkout session created: ${session.id}`);
    return { url: session.url, sessionId: session.id };
  }

  async function createPortalSession(
    customerId: string,
    returnPath = '/billing',
  ): Promise<{ url: string }> {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${opts.webUrl}${returnPath}`,
    });
    return { url: session.url };
  }

  function tierFromPriceId(priceId: string | undefined): string {
    if (!priceId) return 'free';
    const map = opts.priceTierMap ?? {};
    const tier = map[priceId];
    if (!tier) {
      log.warn(`Unknown Stripe price ID: ${priceId} — defaulting to 'pro'`);
      return 'pro';
    }
    return tier;
  }

  return {
    getOrCreateCustomer,
    createCheckoutSession,
    createPortalSession,
    tierFromPriceId,
    getStripe: () => stripe,
  };
}
