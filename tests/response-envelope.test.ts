import { describe, it, expect } from 'vitest';
import { envelope, errorEnvelope } from '../src/api/response-envelope.js';

describe('envelope()', () => {
  it('wraps data with success:true', () => {
    const result = envelope({ users: [1, 2, 3] });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ users: [1, 2, 3] });
    expect(result.error).toBeNull();
  });

  it('generates UUID request_id', () => {
    const result = envelope('test');
    expect(result.meta.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('generates ISO timestamp', () => {
    const result = envelope(null);
    expect(result.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('each call generates a unique request_id', () => {
    const r1 = envelope(1);
    const r2 = envelope(2);
    expect(r1.meta.request_id).not.toBe(r2.meta.request_id);
  });
});

describe('errorEnvelope()', () => {
  it('wraps code and message with success:false', () => {
    const result = errorEnvelope('VALIDATION_ERROR', 'Email is required');
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.message).toBe('Email is required');
  });

  it('defaults details to null', () => {
    const result = errorEnvelope('ERR', 'msg');
    expect(result.error.details).toBeNull();
  });

  it('includes details when provided', () => {
    const details = [{ field: 'email', message: 'Required' }];
    const result = errorEnvelope('VALIDATION', 'Invalid fields', details);
    expect(result.error.details).toEqual(details);
  });

  it('has meta with timestamp and request_id', () => {
    const result = errorEnvelope('ERR', 'msg');
    expect(result.meta.timestamp).toBeTruthy();
    expect(result.meta.request_id).toBeTruthy();
  });
});
