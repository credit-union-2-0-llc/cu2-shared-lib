/**
 * Express rate limiter middleware factory.
 *
 * Extracted from: pm-knowledge-ai/backend/src/index.ts
 *
 * Usage:
 *   import { createRateLimiter } from '@cu2/shared-lib/api/rate-limiter';
 *
 *   const aiLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
 *   app.post('/api/ai/query', aiLimiter, handler);
 *
 *   const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 5, message: 'Too many login attempts' });
 *   app.post('/api/auth/login', authLimiter, handler);
 */

import type { Request, Response, NextFunction } from 'express';

export interface RateLimiterOptions {
  /** Time window in milliseconds (default: 60_000 = 1 minute) */
  windowMs?: number;
  /** Max requests per window per IP (default: 10) */
  max?: number;
  /** Custom error message (default: 'Too many requests — please wait before retrying') */
  message?: string;
  /** Custom key generator (default: IP-based) */
  keyGenerator?: (req: Request) => string;
}

interface RateEntry {
  count: number;
  resetAt: number;
}

/**
 * Creates an in-memory rate limiter middleware.
 *
 * For single-process Express apps. If you need distributed rate limiting
 * across multiple instances, use express-rate-limit with a Redis store instead.
 */
export function createRateLimiter(opts: RateLimiterOptions = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 10;
  const message = opts.message ?? 'Too many requests — please wait before retrying';
  const keyGen = opts.keyGenerator ?? ((req: Request) =>
    req.ip ?? req.headers['x-forwarded-for']?.toString() ?? 'unknown');

  const store = new Map<string, RateEntry>();

  // Periodic cleanup to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, windowMs * 2);

  // Allow GC to clean up the interval if the middleware is discarded
  if (cleanupInterval.unref) cleanupInterval.unref();

  return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    const key = keyGen(req);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        data: null,
        error: { code: 'RATE_LIMITED', message },
        meta: { timestamp: new Date().toISOString(), retry_after_seconds: retryAfter },
      });
      return;
    }

    next();
  };
}
