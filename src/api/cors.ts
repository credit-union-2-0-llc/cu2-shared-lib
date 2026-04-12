/**
 * CORS middleware factory for Express.
 *
 * Extracted from: pm-knowledge-ai/backend/src/index.ts
 *
 * Usage:
 *   import { createCorsMiddleware } from '@cu2/shared-lib/api/cors';
 *
 *   app.use(createCorsMiddleware({
 *     productionOrigins: ['https://app.mysite.com'],
 *     devOrigins: ['http://localhost:3000', 'http://localhost:5173'],
 *     credentials: true,
 *     extraHeaders: ['x-api-key'],
 *   }));
 */

import type { Request, Response, NextFunction } from 'express';

export interface CorsOptions {
  /** Allowed origins in production */
  productionOrigins?: string[];
  /** Allowed origins in development (default: common localhost ports) */
  devOrigins?: string[];
  /** Allow credentials / cookies (default: true) */
  credentials?: boolean;
  /** Extra allowed headers beyond Content-Type and Authorization */
  extraHeaders?: string[];
  /** Allowed methods (default: GET, POST, PUT, PATCH, DELETE, OPTIONS) */
  methods?: string[];
  /** Max preflight cache in seconds (default: 86400 = 24h) */
  maxAge?: number;
}

/**
 * Creates CORS middleware that switches allowed origins based on NODE_ENV.
 *
 * Production: only origins in `productionOrigins`.
 * Development: origins in `devOrigins` (defaults to localhost:3000/5173/5174/8080).
 */
export function createCorsMiddleware(opts: CorsOptions = {}) {
  const isProd = process.env['NODE_ENV'] === 'production';
  const devDefaults = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:8080',
  ];

  const allowedOrigins = isProd
    ? (opts.productionOrigins ?? [])
    : (opts.devOrigins ?? devDefaults);

  const credentials = opts.credentials ?? true;
  const methods = (opts.methods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).join(', ');
  const baseHeaders = ['Content-Type', 'Authorization'];
  const allowedHeaders = [...baseHeaders, ...(opts.extraHeaders ?? [])].join(', ');
  const maxAge = String(opts.maxAge ?? 86400);

  return function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
    const origin = req.headers.origin;

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders);
    res.setHeader('Access-Control-Max-Age', maxAge);

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}
