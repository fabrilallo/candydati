import { describe, expect, it } from 'vitest';
import {
  canAssignRole,
  isPermission,
  isRole,
  PERMISSIONS,
  permissionsOf,
  roleHasPermission,
  ROLE_GRANTS,
  ROLES,
  STATEMENTS,
} from './permissions.js';

describe('permissions', () => {
  it('lists every resource:action pair once', () => {
    expect(PERMISSIONS).toContain('member:create');
    expect(PERMISSIONS).toContain('audit:read');
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('gives the owner everything', () => {
    expect(permissionsOf('owner')).toEqual(PERMISSIONS);
  });

  it('lets an admin manage people and read the audit log but not delete the organization', () => {
    expect(roleHasPermission('admin', 'invitation:create')).toBe(true);
    expect(roleHasPermission('admin', 'audit:read')).toBe(true);
    expect(roleHasPermission('admin', 'organization:delete')).toBe(false);
  });

  it.each(['recruiter', 'hiring_manager', 'interviewer'] as const)('gives %s no administrative permission', (role) => {
    expect(permissionsOf(role)).toEqual([]);
  });

  it('never grants an action that the statements do not declare', () => {
    for (const role of ROLES) {
      for (const [resource, actions] of Object.entries(ROLE_GRANTS[role])) {
        const declared: readonly string[] = STATEMENTS[resource as keyof typeof STATEMENTS];
        expect(declared).toEqual(expect.arrayContaining([...actions]));
      }
    }
  });

  it('narrows roles and permissions', () => {
    expect(isRole('owner')).toBe(true);
    expect(isRole('member')).toBe(false);
    expect(isPermission('member:create')).toBe(true);
    expect(isPermission('member:fly')).toBe(false);
    expect(isPermission(42)).toBe(false);
  });
});

describe('canAssignRole', () => {
  it('lets only an owner assign the owner role', () => {
    expect(canAssignRole('owner', 'owner')).toBe(true);
    expect(canAssignRole('admin', 'owner')).toBe(false);
  });

  it('lets an admin assign the other roles', () => {
    expect(canAssignRole('admin', 'admin')).toBe(true);
    expect(canAssignRole('admin', 'interviewer')).toBe(true);
  });

  it('refuses anyone who cannot manage members', () => {
    expect(canAssignRole('recruiter', 'interviewer')).toBe(false);
  });
});
