/**
 * @cu2/shared-lib/tagging — typed Azure resource tags
 *
 * v1.1.0 — cu2-billing W2-01 / TAGS-03 (deferred from Wave 1).
 *
 * Provides:
 *   • Template-literal types for the four required Azure tags
 *   • RequiredTags interface (compile-time contract)
 *   • buildAzureResourceTags(input)  — flattens to a Record for Azure SDK calls
 *   • assertRequiredTags(tags)        — runtime guard (rejects missing keys)
 *
 * `cu-tenant-id` accepts either a UUID-stringified tenant id OR the literal
 * `'shared'` (matches W1 vendor_keys.cu_tenant_id NULL → 'shared' coercion).
 */

export type Environment =
  | 'production'
  | 'staging'
  | 'sandbox'
  | 'development';

export type TenantTag = `cu-tenant-id:${string}`;
export type AppTag = `app-code:${string}`;
export type CostCenterTag = `cost-center:${string}`;
export type EnvTag = `environment:${Environment}`;

export interface RequiredTags {
  /** UUID-stringified tenant id, or literal 'shared' for cross-tenant infra. */
  'cu-tenant-id': string;
  /** App code (e.g. 'cu2-billing', 'scienceworks'). */
  'app-code': string;
  /** Optional cost center label (e.g. 'finance', 'engineering'). */
  'cost-center'?: string;
  /** Deployment environment. */
  environment: Environment;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Build a flat `Record<string, string>` of Azure resource tags. Drops any
 * undefined/empty optional fields so the resulting object only contains the
 * keys the caller actually populated.
 */
export function buildAzureResourceTags(
  input: RequiredTags,
): Record<string, string> {
  const out: Record<string, string> = {
    'cu-tenant-id': input['cu-tenant-id'],
    'app-code': input['app-code'],
    environment: input.environment,
  };
  if (input['cost-center'] && input['cost-center'].length > 0) {
    out['cost-center'] = input['cost-center'];
  }
  return out;
}

/**
 * Runtime guard. Asserts that the supplied object satisfies RequiredTags:
 *   • cu-tenant-id is non-empty AND (matches UUID OR equals literal 'shared')
 *   • app-code is non-empty
 *   • environment is one of the four allowed strings
 *
 * Throws an Error citing the first missing/invalid key.
 */
export function assertRequiredTags(
  tags: Record<string, string>,
): asserts tags is RequiredTags & Record<string, string> {
  const tenant = tags['cu-tenant-id'];
  if (!tenant || tenant.length === 0) {
    throw new Error(
      "[assertRequiredTags] missing required tag 'cu-tenant-id'",
    );
  }
  if (tenant !== 'shared' && !UUID_RE.test(tenant)) {
    throw new Error(
      `[assertRequiredTags] 'cu-tenant-id' must be a UUID or the literal 'shared' (got: ${tenant})`,
    );
  }
  if (!tags['app-code'] || tags['app-code'].length === 0) {
    throw new Error("[assertRequiredTags] missing required tag 'app-code'");
  }
  const env = tags.environment;
  if (
    env !== 'production' &&
    env !== 'staging' &&
    env !== 'sandbox' &&
    env !== 'development'
  ) {
    throw new Error(
      `[assertRequiredTags] 'environment' must be production|staging|sandbox|development (got: ${env})`,
    );
  }
}
