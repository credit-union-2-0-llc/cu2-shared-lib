/**
 * @cu2/shared-lib/send/persona — Persona Inquiry creator that REQUIRES cu_tenant_id.
 *
 * v1.2.0 — cu2-billing W3-01.
 *
 * Persona has no first-party server-side npm SDK (the `persona` package is the
 * browser Inquiry Flow widget). Server-side inquiry creation goes through
 * Persona's REST API: POST https://api.withpersona.com/api/v1/inquiries
 *
 * This wrapper takes a `template_map` keyed by cu_tenant_id, picks the first
 * template id for that tenant (throwing if absent), and stamps:
 *   • reference-id          = `cu-<cu_tenant_id>-<user_ref>`
 *   • inquiry-template-id   = template_map[cu_tenant_id][0]
 *
 * The `no-direct-vendor-sdk` ESLint rule (this same package) bans direct
 * `import 'persona-sdk' | 'persona'` outside this file.
 *
 * Companion wrappers (v1.2.0): twilio, plaid.
 */

export interface CreatePersonaInquiryInput {
  /** REQUIRED — compile-time enforced. UUID-stringified tenant id, or 'shared'. */
  cu_tenant_id: string;
  /** Per-CU stable user reference (e.g. member uuid, application id). */
  user_ref: string;
  /** Map of cu_tenant_id -> ordered list of Persona template ids. First is selected. */
  template_map: Record<string, string[]>;
}

export interface CreatePersonaInquiryDeps {
  /** Persona API key (Bearer). */
  apiKey: string;
  /** Optional override for testing; defaults to Persona prod base URL. */
  baseUrl?: string;
  /** Optional fetch override; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export type PersonaReferenceId = `cu-${string}-${string}`;

export interface CreatePersonaInquiryResult {
  inquiry_id: string;
  reference_id: PersonaReferenceId;
  inquiry_template_id: string;
}

const DEFAULT_BASE_URL = 'https://api.withpersona.com/api/v1';

/**
 * Create a Persona inquiry, stamping reference-id and inquiry-template-id from
 * the per-CU template map.
 *
 * @throws if no template id is registered for `cu_tenant_id`.
 * @throws if the Persona API returns a non-2xx status.
 */
export async function createPersonaInquiry(
  input: CreatePersonaInquiryInput,
  deps: CreatePersonaInquiryDeps,
): Promise<CreatePersonaInquiryResult> {
  const templates = input.template_map[input.cu_tenant_id];
  if (!templates || templates.length === 0) {
    throw new Error(
      `[createPersonaInquiry] no Persona template registered for cu_tenant_id='${input.cu_tenant_id}'`,
    );
  }
  const inquiry_template_id = templates[0];
  const reference_id: PersonaReferenceId = `cu-${input.cu_tenant_id}-${input.user_ref}`;

  const url = `${deps.baseUrl ?? DEFAULT_BASE_URL}/inquiries`;
  const fetchFn = deps.fetchImpl ?? fetch;

  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${deps.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      data: {
        attributes: {
          'inquiry-template-id': inquiry_template_id,
          'reference-id': reference_id,
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `[createPersonaInquiry] Persona API ${res.status}: ${text || res.statusText}`,
    );
  }

  const json = (await res.json()) as { data?: { id?: string } };
  const inquiry_id = json?.data?.id;
  if (!inquiry_id) {
    throw new Error('[createPersonaInquiry] Persona response missing data.id');
  }

  return { inquiry_id, reference_id, inquiry_template_id };
}
