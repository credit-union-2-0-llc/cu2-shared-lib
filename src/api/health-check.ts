/**
 * Health check endpoint factory for Express.
 *
 * Extracted from: pm-knowledge-ai/backend/src/index.ts
 *
 * Usage:
 *   import { createHealthCheck } from '@cu2/shared-lib/api/health-check';
 *
 *   app.get('/health', createHealthCheck({
 *     version: '1.0.0',
 *     checks: {
 *       database: async () => { await pool.query('SELECT 1'); },
 *       redis: async () => { await redis.ping(); },
 *     },
 *   }));
 */

import type { Request, Response } from 'express';

export interface HealthCheckOptions {
  /** App version string */
  version?: string;
  /** Named health checks — each should throw on failure */
  checks?: Record<string, () => Promise<void>>;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded';
  version: string;
  uptime: number;
  commit: string;
  checks: Record<string, 'connected' | 'disconnected'>;
}

export function createHealthCheck(opts: HealthCheckOptions = {}) {
  const startTime = Date.now();

  return async function healthHandler(_req: Request, res: Response): Promise<void> {
    const checks: Record<string, 'connected' | 'disconnected'> = {};
    let healthy = true;

    for (const [name, check] of Object.entries(opts.checks ?? {})) {
      try {
        await check();
        checks[name] = 'connected';
      } catch {
        checks[name] = 'disconnected';
        healthy = false;
      }
    }

    const result: HealthCheckResult = {
      status: healthy ? 'healthy' : 'degraded',
      version: opts.version ?? process.env['npm_package_version'] ?? '0.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      commit: process.env['GIT_COMMIT'] ?? 'dev',
      checks,
    };

    res.status(healthy ? 200 : 503).json(result);
  };
}
