import { describe, expect, it } from 'vitest';
import {
  canAssignRole,
  isPermission,
  isRole,
  type Permission,
  PERMISSIONS,
  permissionsOf,
  roleHasPermission,
  ROLE_GRANTS,
  ROLES,
  STATEMENTS,
} from './permissions.js';

const JOB_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (permission) => permission.startsWith('job:') || permission.startsWith('job_template:'),
);

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

  it('gives the owner, admin and recruiter every job and job template permission', () => {
    expect(JOB_PERMISSIONS).toHaveLength(8);
    for (const role of ['owner', 'admin', 'recruiter'] as const) {
      expect(permissionsOf(role)).toEqual(expect.arrayContaining([...JOB_PERMISSIONS]));
    }
  });

  it('lets a hiring manager write and edit ads but not publish or close them', () => {
    expect(permissionsOf('hiring_manager')).toEqual(['job:read', 'job:create', 'job:update', 'job_template:read']);
    expect(roleHasPermission('hiring_manager', 'job:publish')).toBe(false);
    expect(roleHasPermission('hiring_manager', 'job:close')).toBe(false);
  });

  it('gives an interviewer read access to ads and nothing else', () => {
    expect(permissionsOf('interviewer')).toEqual(['job:read']);
  });

  it('gives recruiters no administrative permission', () => {
    expect(permissionsOf('recruiter').some((permission) => permission.startsWith('member:'))).toBe(false);
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
