import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCache } from '../src/cache/redis-cache.js';
import type { CacheClient } from '../src/cache/redis-cache.js';

describe('createCache (in-memory fallback)', () => {
  let cache: CacheClient;
  const silentLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    cache = createCache({ logger: silentLogger }); // no URL = in-memory
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('set / get', () => {
    it('round-trips a string value', async () => {
      await cache.set('key1', 'value1', 60);
      expect(await cache.get('key1')).toBe('value1');
    });

    it('returns null for non-existent key', async () => {
      expect(await cache.get('missing')).toBeNull();
    });
  });

  describe('TTL expiration', () => {
    it('returns value before TTL expires', async () => {
      await cache.set('ttl-key', 'data', 10); // 10 seconds
      vi.advanceTimersByTime(9_000);
      expect(await cache.get('ttl-key')).toBe('data');
    });

    it('returns null after TTL expires', async () => {
      await cache.set('ttl-key', 'data', 10);
      vi.advanceTimersByTime(11_000);
      expect(await cache.get('ttl-key')).toBeNull();
    });
  });

  describe('del', () => {
    it('removes a key', async () => {
      await cache.set('k', 'v', 60);
      await cache.del('k');
      expect(await cache.get('k')).toBeNull();
    });

    it('does not throw on missing key', async () => {
      await expect(cache.del('nope')).resolves.toBeUndefined();
    });
  });

  describe('invalidateByPattern', () => {
    it('removes matching keys', async () => {
      await cache.set('user:1', 'a', 60);
      await cache.set('user:2', 'b', 60);
      await cache.set('order:1', 'c', 60);

      await cache.invalidateByPattern('user:*');

      expect(await cache.get('user:1')).toBeNull();
      expect(await cache.get('user:2')).toBeNull();
      expect(await cache.get('order:1')).toBe('c'); // untouched
    });
  });

  describe('checkRateLimit', () => {
    it('allows requests under limit', async () => {
      const r1 = await cache.checkRateLimit('rl-key', { limit: 3, windowSeconds: 60 });
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = await cache.checkRateLimit('rl-key', { limit: 3, windowSeconds: 60 });
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);
    });

    it('blocks at limit', async () => {
      for (let i = 0; i < 3; i++) {
        await cache.checkRateLimit('rl2', { limit: 3, windowSeconds: 60 });
      }
      const blocked = await cache.checkRateLimit('rl2', { limit: 3, windowSeconds: 60 });
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });
  });

  describe('trackSpend / checkSpendCap', () => {
    it('accumulates spend and checks cap', async () => {
      const r1 = await cache.trackSpend('spend-key', 100, 500);
      expect(r1.currentCents).toBe(100);
      expect(r1.withinCap).toBe(true);

      const r2 = await cache.trackSpend('spend-key', 300, 500);
      expect(r2.currentCents).toBe(400);
      expect(r2.withinCap).toBe(true);

      const r3 = await cache.trackSpend('spend-key', 200, 500);
      expect(r3.currentCents).toBe(600);
      expect(r3.withinCap).toBe(false);
    });

    it('checkSpendCap reports current state', async () => {
      await cache.trackSpend('sc', 250, 1000);
      const result = await cache.checkSpendCap('sc', 1000);
      expect(result.currentCents).toBe(250);
      expect(result.withinCap).toBe(true);
    });

    it('checkSpendCap returns 0 for unknown key', async () => {
      const result = await cache.checkSpendCap('unknown', 1000);
      expect(result.currentCents).toBe(0);
      expect(result.withinCap).toBe(true);
    });
  });
});
