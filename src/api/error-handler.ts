/**
 * Express error handling middleware + structured API responses.
 *
 * Extracted from: trendforge-orchestration/src/middleware/error-handler.ts
 *
 * Usage:
 *   import { AppError, errorHandler, notFound, ok, fail } from '@cu2/shared-lib/api/error-handler';
 *
 *   // Throw structured errors
 *   throw new AppError(400, 'INVALID_INPUT', 'Email is required');
 *
 *   // Mount at end of middleware chain
 *   app.use(notFound);
 *   app.use(errorHandler());
 *
 *   // Response helpers
 *   res.json(ok({ user: { id: 1 } }));
 *   res.status(400).json(fail('INVALID_INPUT', 'Email is required'));
 */

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: Record<string, unknown> } | null;
  meta: { timestamp: string; request_id: string };
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json(fail('NOT_FOUND', 'Endpoint not found'));
}

export interface ErrorHandlerOptions {
  /** Logger. Defaults to console. */
  logger?: { error: (msg: string, meta?: unknown) => void };
  /** Expose stack traces (default: false, enable in dev only) */
  exposeStack?: boolean;
}

export function errorHandler(opts: ErrorHandlerOptions = {}) {
  const log = opts.logger ?? console;

  return function _errorHandler(
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ): void {
    if (err instanceof AppError) {
      res.status(err.statusCode).json(fail(err.code, err.message, err.details));
      return;
    }

    // OAuth / JWT errors
    if (
      err instanceof Error &&
      (err.name === 'UnauthorizedError' || err.message.includes('Unauthorized'))
    ) {
      res.status(401).json(fail('UNAUTHORIZED', 'Missing or invalid OAuth token'));
      return;
    }

    // Generic
    const message = err instanceof Error ? err.message : 'Internal server error';
    log.error('Unhandled error', {
      error: message,
      stack: opts.exposeStack && err instanceof Error ? err.stack : undefined,
    });

    res.status(500).json(fail('INTERNAL_ERROR', 'An unexpected error occurred'));
  };
}

// ─── Response Helpers ──────────────────────────────────────────────────

function meta() {
  return { timestamp: new Date().toISOString(), request_id: randomUUID() };
}

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null, meta: meta() };
}

export function fail(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiResponse<null> {
  return { success: false, data: null, error: { code, message, details }, meta: meta() };
}
