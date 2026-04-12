/**
 * Role-Based Access Control (RBAC) framework.
 *
 * Provides a configurable role hierarchy with action-to-role mapping,
 * permission checking, and tenant-scoped access control.
 *
 * Extracted from: cugiftbot/src/lib/rbac.ts, scienceworks-platform roles
 *
 * Usage:
 *   import { createRbac } from '@cu2/shared-lib/auth/rbac';
 *
 *   const rbac = createRbac({
 *     hierarchy: {
 *       SUPER_ADMIN: 4,
 *       ADMIN: 3,
 *       MANAGER: 2,
 *       VIEWER: 1,
 *     },
 *     actions: {
 *       view_dashboard: 'VIEWER',
 *       manage_users:   'SUPER_ADMIN',
 *       export_data:    'MANAGER',
 *     },
 *   });
 *
 *   rbac.hasRole('ADMIN', 'VIEWER');              // true (ADMIN >= VIEWER)
 *   rbac.canPerform('VIEWER', 'manage_users');     // false
 *   rbac.canAccessTenant('ADMIN', 'tenant-1', 'tenant-2'); // false
 *   rbac.canAccessTenant('SUPER_ADMIN', null, 'any');       // true
 *
 * Express middleware:
 *   app.delete('/users/:id', rbac.requireAction('manage_users'), handler);
 *
 * NestJS: use createRoleGuard from '@cu2/shared-lib/auth' instead.
 */

import type { Request, Response, NextFunction } from 'express';

// ---------- Types ----------

/** Map of role name to numeric level (higher = more permissions). */
export type RoleHierarchy = Record<string, number>;

/** Map of action name to minimum required role. */
export type ActionRoles = Record<string, string>;

export interface RbacOptions {
  /** Role hierarchy — role name → numeric level. Higher levels inherit all lower permissions. */
  hierarchy: RoleHierarchy;
  /** Action-to-role mapping — action name → minimum role required. */
  actions?: ActionRoles;
  /** Name of the top-level role that can access all tenants (default: highest in hierarchy). */
  superRole?: string;
}

export interface Rbac {
  /** Check if userRole has at least requiredRole's level. */
  hasRole(userRole: string, requiredRole: string): boolean;
  /** Check if a role can perform a specific action. Returns false for unknown actions. */
  canPerform(userRole: string, action: string): boolean;
  /** Check tenant access. The super role can access any tenant; others are scoped. */
  canAccessTenant(userRole: string, userTenantId: string | null, targetTenantId: string): boolean;
  /** Express middleware: require a minimum role. Reads role from req.user.role. */
  requireRole(role: string): (req: Request, res: Response, next: NextFunction) => void;
  /** Express middleware: require permission for a specific action. */
  requireAction(action: string): (req: Request, res: Response, next: NextFunction) => void;
  /** Get the sorted list of roles (highest first). */
  getRoles(): string[];
}

// ---------- Factory ----------

export function createRbac(options: RbacOptions): Rbac {
  const { hierarchy, actions = {} } = options;

  // Determine super role (highest numeric level)
  const superRole = options.superRole ??
    Object.entries(hierarchy).sort((a, b) => b[1] - a[1])[0]?.[0];

  function hasRole(userRole: string, requiredRole: string): boolean {
    const userLevel = hierarchy[userRole];
    const requiredLevel = hierarchy[requiredRole];
    if (userLevel === undefined || requiredLevel === undefined) return false;
    return userLevel >= requiredLevel;
  }

  function canPerform(userRole: string, action: string): boolean {
    const required = actions[action];
    if (!required) return false;
    return hasRole(userRole, required);
  }

  function canAccessTenant(
    userRole: string,
    userTenantId: string | null,
    targetTenantId: string,
  ): boolean {
    if (superRole && userRole === superRole) return true;
    return userTenantId === targetTenantId;
  }

  function requireRoleMw(role: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as unknown as { user?: { role?: string } }).user;
      if (!user?.role || !hasRole(user.role, role)) {
        res.status(403).json({ error: 'Forbidden', message: `Requires role: ${role}` });
        return;
      }
      next();
    };
  }

  function requireAction(action: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as unknown as { user?: { role?: string } }).user;
      if (!user?.role || !canPerform(user.role, action)) {
        res.status(403).json({ error: 'Forbidden', message: `Requires permission: ${action}` });
        return;
      }
      next();
    };
  }

  return {
    hasRole,
    canPerform,
    canAccessTenant,
    requireRole: requireRoleMw,
    requireAction,
    getRoles: () => Object.entries(hierarchy).sort((a, b) => b[1] - a[1]).map(([k]) => k),
  };
}
