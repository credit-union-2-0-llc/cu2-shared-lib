/**
 * @cu2/shared-lib/send/resend — Resend wrapper that REQUIRES cu_tenant_id.
 *
 * v1.1.0 — cu2-billing W2-01.
 *
 * Compile-time contract: every send must carry cu_tenant_id at the call site.
 * Runtime behavior: forwards to `resend.emails.send(...)` and stamps the
 * tenant id as a Resend tag (`{name: 'cu_tenant_id', value: <id>}`) so it
 * shows up in Resend dashboards + webhooks.
 *
 * The `no-direct-vendor-sdk` ESLint rule (this same package) bans direct
 * `import 'resend'` outside this file. Consumers MUST go through this wrapper.
 *
 * NOTE: Twilio / Persona / Plaid wrappers are intentionally NOT shipped in
 * v1.1.0 (deferred to v1.2.0 per cu2-billing 02-RESEARCH.md correction Q6).
 * Bundling them now would publish dead code.
 */
import type { Resend } from 'resend';

export interface SendResendEmailInput {
  /** REQUIRED — compile-time enforced. UUID-stringified tenant id, or 'shared'. */
  cu_tenant_id: string;
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** Optional caller-supplied tags; cu_tenant_id is appended automatically. */
  tags?: Array<{ name: string; value: string }>;
}

export interface SendResendEmailDeps {
  resend: Resend;
}

/**
 * Send an email via Resend with cu_tenant_id stamped as a tag.
 *
 * @returns the Resend message id (`{ id }`).
 * @throws if Resend returns an error envelope (`error != null`).
 */
export async function sendResendEmail(
  input: SendResendEmailInput,
  deps: SendResendEmailDeps,
): Promise<{ id: string }> {
  const tags = [
    ...(input.tags ?? []),
    { name: 'cu_tenant_id', value: input.cu_tenant_id },
  ];

  const payload = {
    from: input.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    tags,
  };

  // Resend's send() returns { data, error } — we surface error as a thrown
  // Error so callers don't accidentally swallow failures.
  const result = (await deps.resend.emails.send(
    payload as Parameters<Resend['emails']['send']>[0],
  )) as { data: { id: string } | null; error: { message: string } | null };

  if (result.error) {
    throw new Error(`[sendResendEmail] Resend error: ${result.error.message}`);
  }
  if (!result.data) {
    throw new Error('[sendResendEmail] Resend returned no data and no error');
  }
  return { id: result.data.id };
}
