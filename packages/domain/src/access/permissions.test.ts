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

  it('gives the admin everything except deleting the organization', () => {
    expect(permissionsOf('admin')).toEqual(PERMISSIONS.filter((permission) => permission !== 'organization:delete'));
    expect(roleHasPermission('admin', 'invitation:create')).toBe(true);
    expect(roleHasPermission('admin', 'audit:read')).toBe(true);
    expect(roleHasPermission('admin', 'privacy:manage')).toBe(true);
    expect(roleHasPermission('admin', 'organization:delete')).toBe(false);
  });

  it('lets a recruiter read, update, move and decide on candidates, and write notes, but not manage privacy', () => {
    for (const permission of [
      'candidate:read',
      'candidate:update',
      'candidate:move',
      'candidate:decide',
      'candidate_note:create',
    ] as const) {
      expect(roleHasPermission('recruiter', permission)).toBe(true);
    }
    expect(roleHasPermission('recruiter', 'privacy:manage')).toBe(false);
  });

  it('gives the owner, admin and recruiter every job and job template permission', () => {
    expect(JOB_PERMISSIONS).toHaveLength(8);
    for (const role of ['owner', 'admin', 'recruiter'] as const) {
      expect(permissionsOf(role)).toEqual(expect.arrayContaining([...JOB_PERMISSIONS]));
    }
  });

  it('lets a hiring manager write ads and move candidates, but not publish, close, decide or manage privacy', () => {
    expect(permissionsOf('hiring_manager')).toEqual([
      'job:read',
      'job:create',
      'job:update',
      'job_template:read',
      'candidate:read',
      'candidate:update',
      'candidate:move',
      'candidate_note:create',
      'message:read',
    ]);
    expect(roleHasPermission('hiring_manager', 'message:send')).toBe(false);
    expect(roleHasPermission('hiring_manager', 'job:publish')).toBe(false);
    expect(roleHasPermission('hiring_manager', 'job:close')).toBe(false);
    expect(roleHasPermission('hiring_manager', 'candidate:decide')).toBe(false);
    expect(roleHasPermission('hiring_manager', 'privacy:manage')).toBe(false);
  });

  it('gives an interviewer read access to ads and candidates and note writing, and nothing else', () => {
    expect(permissionsOf('interviewer')).toEqual(['job:read', 'candidate:read', 'candidate_note:create', 'message:read']);
  });

  it('lets owner, admin and recruiter send messages and manage templates; only owner and admin manage email settings', () => {
    for (const role of ['owner', 'admin', 'recruiter'] as const) {
      expect(roleHasPermission(role, 'message:read')).toBe(true);
      expect(roleHasPermission(role, 'message:send')).toBe(true);
      expect(roleHasPermission(role, 'email_template:manage')).toBe(true);
    }
    expect(roleHasPermission('owner', 'email_settings:manage')).toBe(true);
    expect(roleHasPermission('admin', 'email_settings:manage')).toBe(true);
    expect(roleHasPermission('recruiter', 'email_settings:manage')).toBe(false);
  });

  it('gives hiring managers and interviewers message:read only', () => {
    for (const role of ['hiring_manager', 'interviewer'] as const) {
      expect(permissionsOf(role).filter((p) => /^(message|email_template|email_settings):/.test(p))).toEqual(['message:read']);
    }
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
