/**
 * @cu2/shared-lib/send/plaid — Plaid linkTokenCreate wrapper that REQUIRES cu_tenant_id.
 *
 * v1.2.0 — cu2-billing W3-01.
 *
 * Compile-time contract: every link-token create must carry cu_tenant_id at
 * the call site.
 * Runtime behavior: forwards to `plaidClient.linkTokenCreate(...)` and stamps:
 *   • client_user_id = `cu-<cu_tenant_id>-<end_user_ref>`
 *
 * Plaid keys auditability off `client_user_id` (the field shows up in webhooks
 * and `/item/get`). Stamping the tenant prefix here means every downstream
 * Plaid event is attributable to a specific CU tenant without an out-of-band
 * lookup.
 *
 * The `no-direct-vendor-sdk` ESLint rule (this same package) bans direct
 * `import 'plaid'` outside this file.
 *
 * Companion wrappers (v1.2.0): twilio, persona.
 */
import type { PlaidApi } from 'plaid';

export type PlaidProduct =
  | 'auth'
  | 'identity'
  | 'transactions'
  | 'identity_verification';

export interface CreatePlaidLinkTokenInput {
  /** REQUIRED — compile-time enforced. UUID-stringified tenant id, or 'shared'. */
  cu_tenant_id: string;
  /** Stable per-CU end-user reference (member uuid, application id, etc.). */
  end_user_ref: string;
  /** Plaid products to enable on the link token. */
  products: PlaidProduct[];
  /** Optional Plaid webhook URL. */
  webhookUrl?: string;
  /** Plaid client_name (shown to user in Link). */
  client_name: string;
  /** Plaid language (e.g. 'en'). */
  language: string;
  /** Plaid country_codes (e.g. ['US']). */
  country_codes: string[];
}

export interface CreatePlaidLinkTokenDeps {
  plaid: PlaidApi;
}

export type PlaidClientUserId = `cu-${string}-${string}`;

export interface CreatePlaidLinkTokenResult {
  link_token: string;
  client_user_id: PlaidClientUserId;
}

/**
 * Create a Plaid link token, stamping the tenant prefix into client_user_id.
 *
 * @throws if the Plaid client throws (network / auth / validation).
 */
export async function createPlaidLinkToken(
  input: CreatePlaidLinkTokenInput,
  deps: CreatePlaidLinkTokenDeps,
): Promise<CreatePlaidLinkTokenResult> {
  const client_user_id: PlaidClientUserId = `cu-${input.cu_tenant_id}-${input.end_user_ref}`;

  const payload = {
    user: { client_user_id },
    client_name: input.client_name,
    products: input.products,
    language: input.language,
    country_codes: input.country_codes,
    ...(input.webhookUrl ? { webhook: input.webhookUrl } : {}),
  };

  const resp = (await deps.plaid.linkTokenCreate(
    payload as unknown as Parameters<PlaidApi['linkTokenCreate']>[0],
  )) as { data: { link_token: string } };

  return { link_token: resp.data.link_token, client_user_id };
}
