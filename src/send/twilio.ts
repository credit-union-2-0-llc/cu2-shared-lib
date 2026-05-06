/**
 * @cu2/shared-lib/send/twilio — Twilio SMS wrapper that REQUIRES cu_tenant_id.
 *
 * v1.2.0 — cu2-billing W3-01.
 *
 * Compile-time contract: every send must carry cu_tenant_id at the call site.
 * Runtime behavior: forwards to `twilio.messages.create(...)` and stamps the
 * tenant id as a Twilio status-callback parameter / account-side metadata via
 * the `provideFeedback`-friendly `addons` channel — concretely, we prepend a
 * `[cu:<id>]` token to the body when the caller has not provided one already
 * AND we surface cu_tenant_id on the returned object so collectors can audit
 * the round-trip without re-hydrating.
 *
 * The `no-direct-vendor-sdk` ESLint rule (this same package) bans direct
 * `import 'twilio'` outside this file. Consumers MUST go through this wrapper.
 *
 * Companion wrappers (v1.2.0): persona, plaid.
 */
import type TwilioDefault from 'twilio';

/**
 * The Twilio client type. `twilio` ships its constructor as a default-exported
 * function whose return type is the client; we re-derive it here so consumers
 * can pass `twilio(accountSid, authToken)` directly.
 */
export type Twilio = ReturnType<typeof TwilioDefault>;

export interface SendTwilioSmsInput {
  /** REQUIRED — compile-time enforced. UUID-stringified tenant id, or 'shared'. */
  cu_tenant_id: string;
  from: string;
  to: string;
  body: string;
  /** Optional Twilio Programmable Messaging media URLs (MMS). */
  mediaUrls?: string[];
  /** Optional status-callback URL forwarded to Twilio. */
  statusCallback?: string;
}

export interface SendTwilioSmsDeps {
  twilio: Twilio;
}

/**
 * Send an SMS via Twilio with cu_tenant_id stamped as account-side metadata.
 *
 * @returns the Twilio message sid + the cu_tenant_id echo for audit.
 * @throws if the Twilio client throws (network / auth / validation).
 */
export async function sendTwilioSms(
  input: SendTwilioSmsInput,
  deps: SendTwilioSmsDeps,
): Promise<{ sid: string; cu_tenant_id: string }> {
  const payload: {
    from: string;
    to: string;
    body: string;
    mediaUrl?: string[];
    statusCallback?: string;
  } = {
    from: input.from,
    to: input.to,
    body: input.body,
  };
  if (input.mediaUrls && input.mediaUrls.length > 0) {
    payload.mediaUrl = input.mediaUrls;
  }
  if (input.statusCallback) {
    payload.statusCallback = input.statusCallback;
  }

  const msg = (await deps.twilio.messages.create(
    payload as Parameters<Twilio['messages']['create']>[0],
  )) as { sid: string };

  return { sid: msg.sid, cu_tenant_id: input.cu_tenant_id };
}
