import { describe, it, expect } from 'vitest';
import { hasPermission, Permission, Role } from '../../../src/modules/auth/rbac.service.js';

describe('Role-Based Access Control (Constitution Principle II & FR-003)', () => {
  const allPermissions: Permission[] = [
    'obligations:read',
    'obligations:create',
    'obligations:update',
    'obligations:delete',
    'org:invite',
    'org:manage_billing',
    'org:delete',
    'audit:read',
  ];

  it('grants Owner all administrative, billing, and mutative permissions', () => {
    for (const perm of allPermissions) {
      expect(hasPermission('owner', perm)).toBe(true);
    }
  });

  it('grants Admin management permissions but restricts org deletion', () => {
    expect(hasPermission('admin', 'obligations:create')).toBe(true);
    expect(hasPermission('admin', 'obligations:update')).toBe(true);
    expect(hasPermission('admin', 'obligations:delete')).toBe(true);
    expect(hasPermission('admin', 'org:invite')).toBe(true);
    expect(hasPermission('admin', 'audit:read')).toBe(true);
    expect(hasPermission('admin', 'org:delete')).toBe(false);
  });

  it('grants Member operational permissions but restricts member invites and billing', () => {
    expect(hasPermission('member', 'obligations:read')).toBe(true);
    expect(hasPermission('member', 'obligations:create')).toBe(true);
    expect(hasPermission('member', 'obligations:update')).toBe(true);
    expect(hasPermission('member', 'obligations:delete')).toBe(false);
    expect(hasPermission('member', 'org:invite')).toBe(false);
    expect(hasPermission('member', 'org:manage_billing')).toBe(false);
  });

  it('strictly restricts Viewer to read-only access and rejects any mutation', () => {
    expect(hasPermission('viewer', 'obligations:read')).toBe(true);
    expect(hasPermission('viewer', 'obligations:create')).toBe(false);
    expect(hasPermission('viewer', 'obligations:update')).toBe(false);
    expect(hasPermission('viewer', 'obligations:delete')).toBe(false);
    expect(hasPermission('viewer', 'org:invite')).toBe(false);
  });
});
