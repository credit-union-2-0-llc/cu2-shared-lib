import { describe, it, expect, vi } from 'vitest';
import { createRateLimiter } from '../src/api/rate-limiter.js';

function mockReq(ip = '127.0.0.1') {
  return { ip, headers: {} } as unknown as import('express').Request;
}

function mockRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.set = vi.fn().mockReturnValue(res);
  return res as unknown as {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };
}

describe('createRateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000 });
    const next = vi.fn();

    for (let i = 0; i < 3; i++) {
      const res = mockRes();
      limiter(mockReq(), res as any, next);
    }

    expect(next).toHaveBeenCalledTimes(3);
  });

  it('blocks requests over the limit with 429', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000 });
    const next = vi.fn();

    // First two pass
    limiter(mockReq(), mockRes() as any, next);
    limiter(mockReq(), mockRes() as any, next);
    expect(next).toHaveBeenCalledTimes(2);

    // Third is blocked
    const blockedRes = mockRes();
    limiter(mockReq(), blockedRes as any, next);
    expect(next).toHaveBeenCalledTimes(2); // not called again
    expect(blockedRes.status).toHaveBeenCalledWith(429);
    expect(blockedRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'RATE_LIMITED' }),
      }),
    );
    expect(blockedRes.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('uses custom message', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, message: 'Slow down' });
    const next = vi.fn();
    limiter(mockReq(), mockRes() as any, next);

    const blockedRes = mockRes();
    limiter(mockReq(), blockedRes as any, next);
    expect(blockedRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Slow down' }),
      }),
    );
  });

  it('tracks different IPs separately', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    const next = vi.fn();

    limiter(mockReq('1.1.1.1'), mockRes() as any, next);
    limiter(mockReq('2.2.2.2'), mockRes() as any, next);
    expect(next).toHaveBeenCalledTimes(2); // both pass
  });

  it('supports custom keyGenerator', () => {
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 60_000,
      keyGenerator: () => 'shared-key',
    });
    const next = vi.fn();

    limiter(mockReq('1.1.1.1'), mockRes() as any, next);
    const res = mockRes();
    limiter(mockReq('2.2.2.2'), res as any, next);
    // Second is blocked because they share a key
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(429);
  });
});
