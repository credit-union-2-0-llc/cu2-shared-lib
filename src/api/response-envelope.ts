/**
 * Standardized API response envelope.
 *
 * All CU2/XDI APIs use a consistent response shape with success/error
 * discriminator, data payload, and metadata (timestamp, request ID).
 *
 * Extracted from: trendforge-execution/src/routes/helpers.ts
 *
 * Usage:
 *   import { envelope, errorEnvelope } from '@cu2/shared-lib/api/response-envelope';
 *
 *   // Success response
 *   res.json(envelope({ users: [...] }));
 *   // → { success: true, data: { users: [...] }, error: null, meta: { timestamp, request_id } }
 *
 *   // Error response
 *   res.status(400).json(errorEnvelope('VALIDATION_ERROR', 'Email is required'));
 *   // → { success: false, data: null, error: { code, message, details: null }, meta: {...} }
 *
 *   // Error with details
 *   res.status(422).json(errorEnvelope('VALIDATION_ERROR', 'Invalid fields', [
 *     { field: 'email', message: 'Required' },
 *   ]));
 *
 * Express middleware:
 *   import { envelopeMiddleware } from '@cu2/shared-lib/api/response-envelope';
 *   app.use(envelopeMiddleware());
 *   // Adds res.ok(data) and res.fail(code, message, status?, details?) helpers
 */

import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

// ---------- Types ----------

export interface SuccessEnvelope<T = unknown> {
  success: true;
  data: T;
  error: null;
  meta: { timestamp: string; request_id: string };
}

export interface ErrorEnvelope {
  success: false;
  data: null;
  error: { code: string; message: string; details: unknown };
  meta: { timestamp: string; request_id: string };
}

export type ApiEnvelope<T = unknown> = SuccessEnvelope<T> | ErrorEnvelope;

// ---------- Helpers ----------

function meta(): { timestamp: string; request_id: string } {
  return { timestamp: new Date().toISOString(), request_id: randomUUID() };
}

/** Wrap data in a success envelope. */
export function envelope<T>(data: T): SuccessEnvelope<T> {
  return { success: true, data, error: null, meta: meta() };
}

/** Create an error envelope. */
export function errorEnvelope(
  code: string,
  message: string,
  details?: unknown,
): ErrorEnvelope {
  return {
    success: false,
    data: null,
    error: { code, message, details: details ?? null },
    meta: meta(),
  };
}

// ---------- Express Middleware ----------

/** Adds res.ok() and res.fail() to every response. */
export function envelopeMiddleware() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const extRes = res as Response & {
      ok: (data: unknown) => void;
      fail: (code: string, message: string, status?: number, details?: unknown) => void;
    };

    extRes.ok = (data: unknown) => {
      res.json(envelope(data));
    };

    extRes.fail = (code: string, message: string, status = 400, details?: unknown) => {
      res.status(status).json(errorEnvelope(code, message, details));
    };

    next();
  };
}
