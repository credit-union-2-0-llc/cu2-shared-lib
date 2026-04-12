import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCorsMiddleware } from '../src/api/cors.js';

function mockReq(origin?: string, method = 'GET') {
  return {
    headers: origin ? { origin } : {},
    method,
  } as unknown as import('express').Request;
}

function mockRes() {
  const headers: Record<string, string> = {};
  const res: Record<string, unknown> = {};
  res.setHeader = vi.fn((k: string, v: string) => { headers[k] = v; });
  res.status = vi.fn().mockReturnValue(res);
  res.end = vi.fn();
  res._headers = headers;
  return res as unknown as {
    setHeader: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    _headers: Record<string, string>;
  };
}

describe('createCorsMiddleware', () => {
  const originalEnv = process.env['NODE_ENV'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalEnv;
    }
  });

  describe('development mode', () => {
    beforeEach(() => {
      process.env['NODE_ENV'] = 'development';
    });

    it('allows default localhost origins', () => {
      const cors = createCorsMiddleware();
      const res = mockRes();
      const next = vi.fn();

      cors(mockReq('http://localhost:3000'), res as any, next);
      expect(res._headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
      expect(next).toHaveBeenCalled();
    });

    it('allows configured dev origins', () => {
      const cors = createCorsMiddleware({
        devOrigins: ['http://localhost:9000'],
      });
      const res = mockRes();
      const next = vi.fn();

      cors(mockReq('http://localhost:9000'), res as any, next);
      expect(res._headers['Access-Control-Allow-Origin']).toBe('http://localhost:9000');
    });

    it('does not set origin header for disallowed origin', () => {
      const cors = createCorsMiddleware();
      const res = mockRes();
      const next = vi.fn();

      cors(mockReq('https://evil.com'), res as any, next);
      expect(res._headers['Access-Control-Allow-Origin']).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('production mode', () => {
    beforeEach(() => {
      process.env['NODE_ENV'] = 'production';
    });

    it('only allows specified production origins', () => {
      const cors = createCorsMiddleware({
        productionOrigins: ['https://app.mysite.com'],
      });
      const res = mockRes();
      const next = vi.fn();

      cors(mockReq('https://app.mysite.com'), res as any, next);
      expect(res._headers['Access-Control-Allow-Origin']).toBe('https://app.mysite.com');
    });

    it('blocks non-listed origins', () => {
      const cors = createCorsMiddleware({
        productionOrigins: ['https://app.mysite.com'],
      });
      const res = mockRes();
      const next = vi.fn();

      cors(mockReq('http://localhost:3000'), res as any, next);
      expect(res._headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('blocks all origins when no production origins configured', () => {
      const cors = createCorsMiddleware();
      const res = mockRes();
      const next = vi.fn();

      cors(mockReq('https://any.com'), res as any, next);
      expect(res._headers['Access-Control-Allow-Origin']).toBeUndefined();
    });
  });

  it('handles OPTIONS preflight with 204', () => {
    process.env['NODE_ENV'] = 'development';
    const cors = createCorsMiddleware();
    const res = mockRes();
    const next = vi.fn();

    cors(mockReq('http://localhost:3000', 'OPTIONS'), res as any, next);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('sets credentials header by default', () => {
    process.env['NODE_ENV'] = 'development';
    const cors = createCorsMiddleware();
    const res = mockRes();
    cors(mockReq('http://localhost:3000'), res as any, vi.fn());
    expect(res._headers['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('includes extra headers', () => {
    process.env['NODE_ENV'] = 'development';
    const cors = createCorsMiddleware({ extraHeaders: ['x-api-key'] });
    const res = mockRes();
    cors(mockReq('http://localhost:3000'), res as any, vi.fn());
    expect(res._headers['Access-Control-Allow-Headers']).toContain('x-api-key');
  });
});
