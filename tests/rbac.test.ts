import { describe, it, expect } from 'vitest';
import { createRbac } from '../src/auth/rbac.js';

const rbac = createRbac({
  hierarchy: {
    SUPER_ADMIN: 4,
    ADMIN: 3,
    MANAGER: 2,
    VIEWER: 1,
  },
  actions: {
    view_dashboard: 'VIEWER',
    manage_users: 'SUPER_ADMIN',
    export_data: 'MANAGER',
    edit_settings: 'ADMIN',
  },
});

describe('hasRole', () => {
  it('returns true when user level >= required level', () => {
    expect(rbac.hasRole('ADMIN', 'VIEWER')).toBe(true);
    expect(rbac.hasRole('SUPER_ADMIN', 'VIEWER')).toBe(true);
    expect(rbac.hasRole('MANAGER', 'MANAGER')).toBe(true); // equal
  });

  it('returns false when user level < required level', () => {
    expect(rbac.hasRole('VIEWER', 'ADMIN')).toBe(false);
    expect(rbac.hasRole('MANAGER', 'SUPER_ADMIN')).toBe(false);
  });

  it('returns false for unknown roles', () => {
    expect(rbac.hasRole('UNKNOWN', 'VIEWER')).toBe(false);
    expect(rbac.hasRole('ADMIN', 'UNKNOWN')).toBe(false);
  });
});

describe('canPerform', () => {
  it('returns true when role has sufficient level for action', () => {
    expect(rbac.canPerform('SUPER_ADMIN', 'manage_users')).toBe(true);
    expect(rbac.canPerform('ADMIN', 'view_dashboard')).toBe(true);
    expect(rbac.canPerform('MANAGER', 'export_data')).toBe(true);
  });

  it('returns false when role is insufficient for action', () => {
    expect(rbac.canPerform('VIEWER', 'manage_users')).toBe(false);
    expect(rbac.canPerform('VIEWER', 'export_data')).toBe(false);
    expect(rbac.canPerform('MANAGER', 'manage_users')).toBe(false);
  });

  it('returns false for unknown actions', () => {
    expect(rbac.canPerform('SUPER_ADMIN', 'delete_universe')).toBe(false);
  });
});

describe('canAccessTenant', () => {
  it('super role accesses any tenant', () => {
    expect(rbac.canAccessTenant('SUPER_ADMIN', null, 'tenant-1')).toBe(true);
    expect(rbac.canAccessTenant('SUPER_ADMIN', 'tenant-2', 'tenant-1')).toBe(true);
  });

  it('non-super only accesses own tenant', () => {
    expect(rbac.canAccessTenant('ADMIN', 'tenant-1', 'tenant-1')).toBe(true);
    expect(rbac.canAccessTenant('ADMIN', 'tenant-1', 'tenant-2')).toBe(false);
    expect(rbac.canAccessTenant('VIEWER', null, 'tenant-1')).toBe(false);
  });
});

describe('getRoles', () => {
  it('returns sorted list highest first', () => {
    const roles = rbac.getRoles();
    expect(roles).toEqual(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'VIEWER']);
  });
});

describe('custom superRole option', () => {
  it('uses the specified superRole instead of auto-detecting highest', () => {
    const custom = createRbac({
      hierarchy: { OWNER: 5, ADMIN: 4, USER: 1 },
      superRole: 'ADMIN', // override: ADMIN is super, not OWNER
    });
    expect(custom.canAccessTenant('ADMIN', null, 'any-tenant')).toBe(true);
    expect(custom.canAccessTenant('OWNER', null, 'different-tenant')).toBe(false);
  });
});
