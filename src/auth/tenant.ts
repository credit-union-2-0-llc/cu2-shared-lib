/**
 * Multi-tenant middleware for Express.
 *
 * Resolves tenant from request headers, subdomain, or custom hostname,
 * then attaches tenant info to the request for downstream use.
 *
 * Extracted from: cugiftbot/src/lib/tenant.ts, cugiftbot multi-tenant migration
 *
 * Usage:
 *   import { createTenantMiddleware } from '@cu2/shared-lib/auth/tenant';
 *
 *   const tenantMw = createTenantMiddleware({
 *     // Strategy 1: Header-based (simplest)
 *     headerName: 'x-tenant-id',
 *
 *     // Strategy 2: Resolve from hostname/subdomain
 *     resolveTenant: async (hostname) => {
 *       const domain = await db.tenantDomain.findFirst({ where: { domain: hostname } });
 *       return domain ? { id: domain.tenantId, slug: domain.tenant.slug } : null;
 *     },
 *
 *     // Optional: cache TTL in ms (default 5 min)
 *     cacheTtlMs: 300_000,
 *   });
 *
 *   app.use(tenantMw);
 *
 *   // In route handlers:
 *   app.get('/api/data', (req, res) => {
 *     const tenantId = req.tenantId;    // string
 *     const tenant = req.tenant;         // full tenant object (if resolveTenant returns it)
 *   });
 */

import type { Request, Response, NextFunction } from 'express';

// ---------- Types ----------

export interface TenantInfo {
  id: string;
  slug?: string;
  [key: string]: unknown;
}

export interface TenantMiddlewareOptions {
  /** Header name to read tenant ID from. Default: 'x-tenant-id' */
  headerName?: string;
  /**
   * Async function to resolve tenant from hostname.
   * Return null if no tenant found (will 404).
   * If not provided, uses header-only strategy.
   */
  resolveTenant?: (hostname: string) => Promise<TenantInfo | null>;
  /** Cache TTL for hostname lookups in ms. Default: 300000 (5 min). Set to 0 to disable. */
  cacheTtlMs?: number;
  /** If true, requests without a resolvable tenant get 404. Default: true */
  required?: boolean;
  /** Logger. Defaults to console. */
  logger?: { warn(msg: string, meta?: unknown): void };
}

// ---------- Cache ----------

interface CacheEntry {
  tenant: TenantInfo | null;
  expiresAt: number;
}

// ---------- Factory ----------

export function createTenantMiddleware(options: TenantMiddlewareOptions = {}) {
  const headerName = (options.headerName ?? 'x-tenant-id').toLowerCase();
  const cacheTtlMs = options.cacheTtlMs ?? 300_000;
  const required = options.required ?? true;
  const log = options.logger ?? console;

  const cache = new Map<string, CacheEntry>();

  async function resolve(req: Request): Promise<TenantInfo | null> {
    // Strategy 1: Header
    const headerVal = req.headers[headerName] as string | undefined;
    if (headerVal) {
      return { id: headerVal };
    }

    // Strategy 2: Hostname resolution
    if (options.resolveTenant) {
      const hostname = req.hostname;

      // Check cache
      if (cacheTtlMs > 0) {
        const cached = cache.get(hostname);
        if (cached && Date.now() < cached.expiresAt) {
          return cached.tenant;
        }
      }

      const tenant = await options.resolveTenant(hostname);

      // Cache result
      if (cacheTtlMs > 0) {
        cache.set(hostname, { tenant, expiresAt: Date.now() + cacheTtlMs });
      }

      return tenant;
    }

    return null;
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenant = await resolve(req);

      if (!tenant && required) {
        res.status(404).json({ error: 'Tenant not found' });
        return;
      }

      // Attach to request
      const extReq = req as Request & { tenantId?: string; tenant?: TenantInfo };
      if (tenant) {
        extReq.tenantId = tenant.id;
        extReq.tenant = tenant;
      }

      next();
    } catch (err) {
      log.warn('Tenant resolution error', { error: (err as Error).message });
      res.status(500).json({ error: 'Tenant resolution failed' });
    }
  };
}
