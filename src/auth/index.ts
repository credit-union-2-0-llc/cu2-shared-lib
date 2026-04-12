export {
  createJwtMiddleware,
  requireRole,
  type AuthUser,
  type JwtMiddlewareOptions,
} from './express-jwt.js';

export {
  Public,
  IS_PUBLIC_KEY,
  createGuardFactory,
  createRoleGuard,
  type JwtPayload,
  type RequestUser,
  type RequestWithUser,
  type Cu2GuardOptions,
} from './nestjs-guard.js';

export {
  createNextAuthConfig,
  type NextAuthAzureOptions,
  type NextAuthAzureConfig,
} from './nextauth-azure.js';
