/**
 * Redis cache with automatic in-memory fallback.
 *
 * When REDIS_URL is not set or Redis is unavailable, falls back to a Map
 * with TTL-based expiration. Production uses ioredis.
 *
 * Extracted from: broflo/apps/api/src/redis/redis.service.ts
 *
 * Usage:
 *   import { createCache } from '@cu2/shared-lib/cache';
 *
 *   const cache = createCache({ url: process.env.REDIS_URL });
 *
 *   await cache.set('key', 'value', 3600);     // 1 hour TTL
 *   const val = await cache.get('key');          // string | null
 *   await cache.invalidateByPattern('user:*');   // glob-style invalidation
 *   await cache.del('key');
 *
 * Rate limiting:
 *   const { allowed, remaining } = await cache.checkRateLimit('user-123', {
 *     limit: 20, windowSeconds: 3600,
 *   });
 *
 * Spend cap tracking:
 *   const { withinCap, currentCents } = await cache.checkSpendCap('daily-spend', 5000);
 *   await cache.trackSpend('daily-spend', 150, 5000);
 *
 * @requires ioredis (optional peer dep — falls back to in-memory without it)
 */

// ---------- Types ----------

export interface CacheOptions {
  /** Redis connection URL. If empty/undefined, uses in-memory fallback. */
  url?: string;
  /** Optional logger (defaults to console). */
  logger?: { info(msg: string, meta?: unknown): void; warn(msg: string, meta?: unknown): void; error(msg: string, meta?: unknown): void };
}

export interface RateLimitOptions {
  /** Max requests allowed in the window. Default: 20 */
  limit?: number;
  /** Window duration in seconds. Default: 3600 (1 hour) */
  windowSeconds?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export interface SpendCapResult {
  withinCap: boolean;
  currentCents: number;
}

export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  invalidateByPattern(pattern: string): Promise<void>;
  checkRateLimit(key: string, opts?: RateLimitOptions): Promise<RateLimitResult>;
  checkSpendCap(key: string, dailyCapCents: number): Promise<SpendCapResult>;
  trackSpend(key: string, costCents: number, dailyCapCents: number): Promise<SpendCapResult>;
  close(): Promise<void>;
}

// ---------- In-Memory Store ----------

interface MemEntry {
  value: string;
  expiresAt: number;
}

class InMemoryStore {
  private store = new Map<string, MemEntry>();

  get(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: string, ttlSeconds: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  del(key: string): void {
    this.store.delete(key);
  }

  invalidateByPattern(pattern: string): void {
    const prefix = pattern.replace('*', '');
    for (const k of this.store.keys()) {
      if (k.includes(prefix)) this.store.delete(k);
    }
  }
}

// ---------- Factory ----------

export function createCache(options: CacheOptions = {}): CacheClient {
  const log = options.logger ?? console;
  const mem = new InMemoryStore();

  // Try to connect to Redis if URL provided
  let redis: unknown = null;
  if (options.url) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Redis = require('ioredis');
      redis = new Redis(options.url);
      (redis as { on(event: string, handler: (err: Error) => void): void }).on('error', (err: Error) => {
        log.error('Redis connection error', { error: err.message });
      });
    } catch {
      log.warn('ioredis not installed — using in-memory cache fallback');
    }
  } else {
    log.warn('No REDIS_URL — using in-memory cache fallback');
  }

  const r = redis as {
    get(key: string): Promise<string | null>;
    setex(key: string, ttl: number, value: string): Promise<void>;
    del(...keys: string[]): Promise<void>;
    keys(pattern: string): Promise<string[]>;
    incr(key: string): Promise<number>;
    incrby(key: string, amount: number): Promise<number>;
    expire(key: string, seconds: number): Promise<void>;
    quit(): Promise<void>;
  } | null;

  return {
    async get(key: string): Promise<string | null> {
      if (!r) return mem.get(key);
      return r.get(key);
    },

    async set(key: string, value: string, ttlSeconds: number): Promise<void> {
      if (!r) { mem.set(key, value, ttlSeconds); return; }
      await r.setex(key, ttlSeconds, value);
    },

    async del(key: string): Promise<void> {
      if (!r) { mem.del(key); return; }
      await r.del(key);
    },

    async invalidateByPattern(pattern: string): Promise<void> {
      if (!r) { mem.invalidateByPattern(pattern); return; }
      const keys = await r.keys(pattern);
      if (keys.length > 0) await r.del(...keys);
    },

    async checkRateLimit(key: string, opts: RateLimitOptions = {}): Promise<RateLimitResult> {
      const limit = opts.limit ?? 20;
      const windowSeconds = opts.windowSeconds ?? 3600;

      if (!r) {
        const raw = mem.get(key);
        const count = raw ? parseInt(raw, 10) : 0;
        if (count >= limit) return { allowed: false, remaining: 0 };
        mem.set(key, String(count + 1), windowSeconds);
        return { allowed: true, remaining: limit - count - 1 };
      }

      const current = await r.incr(key);
      if (current === 1) await r.expire(key, windowSeconds);
      const allowed = current <= limit;
      return { allowed, remaining: Math.max(0, limit - current) };
    },

    async checkSpendCap(key: string, dailyCapCents: number): Promise<SpendCapResult> {
      if (!r) {
        const raw = mem.get(key);
        const current = raw ? parseInt(raw, 10) : 0;
        return { withinCap: current < dailyCapCents, currentCents: current };
      }
      const raw = await r.get(key);
      const current = raw ? parseInt(raw, 10) : 0;
      return { withinCap: current < dailyCapCents, currentCents: current };
    },

    async trackSpend(key: string, costCents: number, dailyCapCents: number): Promise<SpendCapResult> {
      if (!r) {
        const raw = mem.get(key);
        const current = raw ? parseInt(raw, 10) : 0;
        const newTotal = current + costCents;
        mem.set(key, String(newTotal), 86400);
        return { withinCap: newTotal <= dailyCapCents, currentCents: newTotal };
      }
      const newTotal = await r.incrby(key, costCents);
      if (newTotal === costCents) await r.expire(key, 86400);
      return { withinCap: newTotal <= dailyCapCents, currentCents: newTotal };
    },

    async close(): Promise<void> {
      if (r) await r.quit();
    },
  };
}
