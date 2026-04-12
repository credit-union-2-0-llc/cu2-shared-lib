import { describe, it, expect, vi } from 'vitest';
import { AppError, ok, fail, notFound, errorHandler } from '../src/api/error-handler.js';

// Mock Express req/res/next
function mockRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as unknown as { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return { ...overrides } as unknown as import('express').Request;
}

const noopNext = vi.fn();

describe('AppError', () => {
  it('has correct status, code, message, details', () => {
    const err = new AppError(422, 'VALIDATION', 'bad input', { field: 'email' });
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toBe('bad input');
    expect(err.details).toEqual({ field: 'email' });
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
  });

  it('details is optional', () => {
    const err = new AppError(400, 'BAD', 'nope');
    expect(err.details).toBeUndefined();
  });
});

describe('ok()', () => {
  it('returns success envelope with data', () => {
    const result = ok({ user: { id: 1 } });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ user: { id: 1 } });
    expect(result.error).toBeNull();
    expect(result.meta.timestamp).toBeTruthy();
    expect(result.meta.request_id).toBeTruthy();
  });
});

describe('fail()', () => {
  it('returns error envelope', () => {
    const result = fail('INVALID', 'bad data');
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error!.code).toBe('INVALID');
    expect(result.error!.message).toBe('bad data');
    expect(result.meta.timestamp).toBeTruthy();
  });

  it('includes details when provided', () => {
    const result = fail('INVALID', 'bad', { field: 'name' });
    expect(result.error!.details).toEqual({ field: 'name' });
  });
});

describe('notFound', () => {
  it('returns 404 JSON', () => {
    const res = mockRes();
    notFound(mockReq(), res as any);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      }),
    );
  });
});

describe('errorHandler()', () => {
  it('catches AppError and returns correct status/json', () => {
    const handler = errorHandler();
    const res = mockRes();
    const err = new AppError(400, 'BAD_REQUEST', 'Missing email');
    handler(err, mockReq(), res as any, noopNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'BAD_REQUEST', message: 'Missing email' }),
      }),
    );
  });

  it('catches UnauthorizedError with 401', () => {
    const handler = errorHandler();
    const res = mockRes();
    const err = new Error('Unauthorized');
    err.name = 'UnauthorizedError';
    handler(err, mockReq(), res as any, noopNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      }),
    );
  });

  it('catches generic Error with 500', () => {
    const logger = { error: vi.fn() };
    const handler = errorHandler({ logger });
    const res = mockRes();
    handler(new Error('boom'), mockReq(), res as any, noopNext);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      }),
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('catches non-Error values with 500', () => {
    const logger = { error: vi.fn() };
    const handler = errorHandler({ logger });
    const res = mockRes();
    handler('string error', mockReq(), res as any, noopNext);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
