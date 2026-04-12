/**
 * @cu2/shared-lib — CU2/XDI shared library
 *
 * Import from subpaths for tree-shaking:
 *   import { createJwtMiddleware } from '@cu2/shared-lib/auth';
 *   import { createEncryptor } from '@cu2/shared-lib/azure';
 *   import { createStripeCheckout } from '@cu2/shared-lib/payments';
 *   import { createSendGridClient } from '@cu2/shared-lib/notifications';
 *   import { createLogger, AppError } from '@cu2/shared-lib/api';
 *   import { createClaudeClient } from '@cu2/shared-lib/ai';
 */

// Re-export everything for convenience (prefer subpath imports in production)
export * from './auth/index.js';
export * from './azure/index.js';
export * from './payments/index.js';
export * from './notifications/index.js';
export * from './api/index.js';
export * from './ai/index.js';
export * from './cache/index.js';
export * from './scheduling/index.js';
export * from './db/index.js';
