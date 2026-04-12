/**
 * Azure Key Vault secret retrieval with env-var fallback for local dev.
 *
 * Extracted from: trendforge-execution/execution-engine/src/config/azure.ts
 *
 * Usage:
 *   import { createKeyVaultClient } from '@cu2/shared-lib/azure/key-vault';
 *
 *   const secrets = createKeyVaultClient({
 *     vaultUri: process.env.AZURE_KEY_VAULT_URI,
 *   });
 *
 *   const dbPassword = await secrets.getSecret('database-password');
 *   // In local dev (no vaultUri): reads DATABASE_PASSWORD env var
 */

export interface KeyVaultOptions {
  /** Key Vault URI (e.g. https://kv-myapp.vault.azure.net). Omit for local dev. */
  vaultUri?: string;
  /** Optional logger */
  logger?: {
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
  /** Cache TTL in ms (default: 5 minutes) */
  cacheTtlMs?: number;
}

interface CacheEntry {
  value: string;
  fetchedAt: number;
}

export interface KeyVaultClient {
  getSecret: (secretName: string, envFallback?: string) => Promise<string>;
}

export function createKeyVaultClient(opts: KeyVaultOptions = {}): KeyVaultClient {
  const log = opts.logger ?? console;
  const cacheTtl = opts.cacheTtlMs ?? 5 * 60 * 1000;
  const cache = new Map<string, CacheEntry>();

  let secretClient: unknown = null;

  async function getAzureClient() {
    if (secretClient) return secretClient;

    // Dynamic imports so projects that don't use Key Vault don't need these deps
    const { DefaultAzureCredential } = await import('@azure/identity');
    const { SecretClient } = await import('@azure/keyvault-secrets');

    const credential = new DefaultAzureCredential();
    secretClient = new SecretClient(opts.vaultUri!, credential);
    return secretClient;
  }

  async function getSecret(secretName: string, envFallback?: string): Promise<string> {
    const fallbackKey = envFallback ?? secretName.toUpperCase().replace(/-/g, '_');

    // Check cache first
    const cached = cache.get(secretName);
    if (cached && (Date.now() - cached.fetchedAt) < cacheTtl) {
      return cached.value;
    }

    // No vault URI — local dev fallback to env var
    if (!opts.vaultUri) {
      const val = process.env[fallbackKey];
      if (!val) {
        throw new Error(
          `Secret "${secretName}" not found. ` +
          `Set AZURE_KEY_VAULT_URI for Key Vault access, or set env var "${fallbackKey}" for local dev.`,
        );
      }
      return val;
    }

    // Fetch from Key Vault
    try {
      const client = await getAzureClient() as { getSecret: (name: string) => Promise<{ value?: string }> };
      const secret = await client.getSecret(secretName);
      if (!secret.value) {
        throw new Error(`Key Vault secret "${secretName}" exists but has no value`);
      }
      cache.set(secretName, { value: secret.value, fetchedAt: Date.now() });
      return secret.value;
    } catch (err) {
      log.error(`Failed to fetch secret "${secretName}" from Key Vault`, { err });
      throw err;
    }
  }

  return { getSecret };
}
