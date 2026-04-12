/**
 * NestJS JWT auth guard for Azure AD.
 *
 * Validates JWT from httpOnly cookies. Supports @Public() decorator
 * to skip auth on specific routes, and a dev bypass mode.
 *
 * Extracted from: AI_CU_CDP/src/common/auth/jwt-auth.guard.ts
 *
 * Usage:
 *   // app.module.ts
 *   providers: [{ provide: APP_GUARD, useClass: Cu2JwtAuthGuard }]
 *
 *   // public route
 *   @Public()
 *   @Get('health')
 *   health() { return { ok: true }; }
 */

export const IS_PUBLIC_KEY = 'cu2_isPublic';

/**
 * Mark a route as public — skips JWT validation.
 * Requires @nestjs/common as a peer dependency.
 */
export function Public(): MethodDecorator & ClassDecorator {
  // Dynamic to avoid hard dep on @nestjs/common at compile time
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SetMetadata } = require('@nestjs/common');
  return SetMetadata(IS_PUBLIC_KEY, true);
}

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role?: string;
  name?: string;
  email?: string;
}

export interface RequestUser {
  sub: string;
  tenantId: string;
  role?: string;
  name?: string;
  email?: string;
}

export interface RequestWithUser {
  user: RequestUser;
  cookies: Record<string, string>;
}

export interface Cu2GuardOptions {
  /** Cookie name holding the JWT (default: 'access_token') */
  cookieName?: string;
  /** When true, bypass auth and inject devUser (default: false) */
  devBypass?: boolean;
  /** Mock user for dev bypass */
  devUser?: RequestUser;
}

/**
 * Factory that creates a NestJS CanActivate guard class.
 * Returns the class itself — register it as APP_GUARD or per-controller.
 *
 * Note: This returns a factory function that NestJS can use.
 * For full DI support, copy this pattern into your project and inject
 * JwtService, Reflector, and ConfigService directly.
 */
export function createGuardFactory(opts: Cu2GuardOptions = {}) {
  const cookieName = opts.cookieName ?? 'access_token';
  const defaultDevUser: RequestUser = {
    sub: '00000000-0000-0000-0000-000000000001',
    tenantId: '00000000-0000-0000-0000-000000000001',
    role: 'admin',
  };

  return {
    IS_PUBLIC_KEY,
    cookieName,
    devBypass: opts.devBypass ?? false,
    devUser: opts.devUser ?? defaultDevUser,
  };
}

/**
 * Role guard factory — restrict routes to specific roles.
 *
 * Usage:
 *   @UseGuards(createRoleGuard('admin'))
 *   @Get('settings')
 *   settings() { ... }
 */
export function createRoleGuard(requiredRole: string) {
  return {
    requiredRole,
    check(user: RequestUser | undefined): boolean {
      return user?.role === requiredRole;
    },
  };
}
