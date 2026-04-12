/**
 * Azure AD JWT middleware for Express.
 *
 * Validates Bearer tokens signed by Azure AD (RS256) using JWKS.
 * Attaches `req.user` with oid, email, name, and roles.
 *
 * Extracted from: trendforge-execution/src/middleware/auth.ts
 *
 * Usage:
 *   import { createJwtMiddleware, requireRole } from '@cu2/shared-lib/auth/express-jwt';
 *
 *   const auth = createJwtMiddleware({
 *     tenantId: process.env.AZURE_AD_TENANT_ID!,
 *     audience: process.env.AZURE_AD_AUDIENCE!,
 *     devBypass: process.env.NODE_ENV === 'development',
 *     devUser: { oid: 'dev-user', email: 'dev@example.com', name: 'Dev', roles: ['Admin'] },
 *   });
 *
 *   app.use(auth);
 *   app.get('/admin', requireRole('Admin'), handler);
 */

import type { Request, Response, NextFunction } from 'express';
import jwt, { type JwtHeader, type SigningKeyCallback } from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

// ─── Types ──────────────────────────────────────────────────────────────

export interface AuthUser {
  oid: string;
  email: string;
  name: string;
  roles: string[];
}

export interface JwtMiddlewareOptions {
  /** Azure AD tenant ID */
  tenantId: string;
  /** Expected audience — client ID or api://<client-id> */
  audience: string | string[];
  /** Skip JWT validation in dev (default: false) */
  devBypass?: boolean;
  /** Mock user when devBypass is active */
  devUser?: AuthUser;
  /** Optional logger (defaults to console) */
  logger?: { warn: (msg: string, meta?: unknown) => void };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface AzureAdClaims {
  oid: string;
  upn?: string;
  preferred_username?: string;
  name?: string;
  roles?: string[];
  aud: string;
}

// ─── Factory ────────────────────────────────────────────────────────────

export function createJwtMiddleware(opts: JwtMiddlewareOptions) {
  const log = opts.logger ?? console;

  const jwksClient = jwksRsa({
    jwksUri: `https://login.microsoftonline.com/${opts.tenantId}/discovery/v2.0/keys`,
    cache: true,
    cacheMaxEntries: 10,
    cacheMaxAge: 60 * 60 * 1000,
    rateLimit: true,
  });

  function getSigningKey(header: JwtHeader, callback: SigningKeyCallback): void {
    if (!header.kid) {
      callback(new Error('JWT missing kid header'));
      return;
    }
    jwksClient.getSigningKey(header.kid, (err, key) => {
      if (err) { callback(err); return; }
      callback(null, key?.getPublicKey());
    });
  }

  function extractUser(decoded: AzureAdClaims): AuthUser {
    return {
      oid: decoded.oid,
      email: decoded.upn ?? decoded.preferred_username ?? decoded.oid,
      name: decoded.name ?? decoded.oid,
      roles: decoded.roles ?? [],
    };
  }

  const defaultDevUser: AuthUser = {
    oid: 'dev-user',
    email: 'dev@localhost',
    name: 'Dev User',
    roles: ['Admin'],
  };

  return function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Dev bypass
    if (opts.devBypass) {
      req.user = opts.devUser ?? defaultDevUser;
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token' },
      });
      return;
    }

    const token = authHeader.slice(7);
    const issuer = `https://login.microsoftonline.com/${opts.tenantId}/v2.0`;

    const audience = Array.isArray(opts.audience) ? opts.audience as [string, ...string[]] : opts.audience;

    jwt.verify(
      token,
      getSigningKey,
      { audience, issuer, algorithms: ['RS256'] },
      (err: unknown, decoded: unknown) => {
        if (err) {
          log.warn('JWT validation failed', { error: (err as Error).message });
          res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
          });
          return;
        }
        req.user = extractUser(decoded as AzureAdClaims);
        next();
      },
    );
  };
}

/**
 * Role-based access check. Use after auth middleware.
 *
 *   app.get('/admin', requireRole('Admin'), handler);
 */
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user?.roles.includes(role)) {
      res.status(403).json({
        success: false,
        error: { code: 'INSUFFICIENT_PERMISSIONS', message: `Role '${role}' required` },
      });
      return;
    }
    next();
  };
}
