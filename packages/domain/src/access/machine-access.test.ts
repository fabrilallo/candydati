import { describe, expect, it } from 'vitest';
import {
  AGENT_EXTRA_FORBIDDEN,
  forbiddenPermissions,
  grantablePermissions,
  isForbiddenFor,
  MACHINE_FORBIDDEN_PERMISSIONS,
} from './machine-access.js';
import { roleHasPermission } from './permissions.js';
import { PERMISSIONS, permissionsOf, ROLES } from './permissions.js';

describe('machine access', () => {
  it('forbids decisions, messages and administration to machines', () => {
    for (const permission of [
      'candidate:decide',
      'candidate:erase',
      'message:send',
      'organization:delete',
      'member:create',
      'member:update',
      'member:delete',
      'invitation:create',
      'invitation:cancel',
      'privacy:manage',
      'webhook:manage',
      'email_settings:manage',
      'data:export',
      'api_key:manage',
      'job_team:manage',
      'restricted_stage:manage',
      'careers_page:manage',
      'migration:manage',
    ] as const) {
      expect(MACHINE_FORBIDDEN_PERMISSIONS).toContain(permission);
    }
    expect(MACHINE_FORBIDDEN_PERMISSIONS).not.toContain('job:read');
  });

  it('keeps candidate:move for keys but not for the agent', () => {
    expect(AGENT_EXTRA_FORBIDDEN).toEqual(['candidate:move']);
    expect(isForbiddenFor('api_key', 'candidate:move')).toBe(false);
    expect(isForbiddenFor('agent', 'candidate:move')).toBe(true);
    expect(isForbiddenFor('agent', 'message:send')).toBe(true);
  });

  it('has no list for users and the system', () => {
    expect(forbiddenPermissions('user')).toEqual([]);
    expect(forbiddenPermissions('system')).toEqual([]);
  });

  it('role matrix: grantable is the role minus the forbidden list, for every role', () => {
    for (const role of ROLES) {
      expect(grantablePermissions(role, 'user')).toEqual(permissionsOf(role));
      const key = grantablePermissions(role, 'api_key');
      const agent = grantablePermissions(role, 'agent');
      for (const permission of PERMISSIONS) {
        const has = permissionsOf(role).includes(permission);
        expect(key.includes(permission)).toBe(has && !MACHINE_FORBIDDEN_PERMISSIONS.includes(permission));
        expect(agent.includes(permission)).toBe(has && !MACHINE_FORBIDDEN_PERMISSIONS.includes(permission) && permission !== 'candidate:move');
      }
    }
  });

  it('lets a recruiter key read and write ads and move candidates, never decide or send', () => {
    const key = grantablePermissions('recruiter', 'api_key');
    expect(key).toContain('job:create');
    expect(key).toContain('candidate:move');
    expect(key).not.toContain('candidate:decide');
    expect(key).not.toContain('message:send');
  });
});

describe('import:manage', () => {
  it('is for owner, admin and recruiter, never for a key or the agent', () => {
    for (const role of ['owner', 'admin', 'recruiter'] as const) expect(roleHasPermission(role, 'import:manage')).toBe(true);
    for (const role of ['hiring_manager', 'interviewer'] as const) expect(roleHasPermission(role, 'import:manage')).toBe(false);
    expect(isForbiddenFor('api_key', 'import:manage')).toBe(true);
    expect(isForbiddenFor('agent', 'import:manage')).toBe(true);
    expect(isForbiddenFor('user', 'import:manage')).toBe(false);
  });
});

describe('migration:manage', () => {
  it('is for owner and admin only, never for a key or the agent', () => {
    expect(ROLES.filter((role) => roleHasPermission(role, 'migration:manage'))).toEqual(['owner', 'admin']);
    expect(isForbiddenFor('api_key', 'migration:manage')).toBe(true);
    expect(isForbiddenFor('agent', 'migration:manage')).toBe(true);
    expect(isForbiddenFor('user', 'migration:manage')).toBe(false);
    expect(grantablePermissions('owner', 'api_key')).not.toContain('migration:manage');
  });
});

describe('job:approve', () => {
  it('is for owner and admin, never for a key or the agent', () => {
    for (const role of ['owner', 'admin'] as const) expect(roleHasPermission(role, 'job:approve')).toBe(true);
    for (const role of ['recruiter', 'hiring_manager', 'interviewer'] as const) expect(roleHasPermission(role, 'job:approve')).toBe(false);
    expect(isForbiddenFor('api_key', 'job:approve')).toBe(true);
    expect(isForbiddenFor('agent', 'job:approve')).toBe(true);
    expect(isForbiddenFor('user', 'job:approve')).toBe(false);
  });

  it('lets keys and the agent read reports: aggregates carry no personal data', () => {
    expect(isForbiddenFor('api_key', 'report:read')).toBe(false);
    expect(isForbiddenFor('agent', 'report:read')).toBe(false);
    expect(grantablePermissions('recruiter', 'api_key')).toContain('report:read');
    expect(grantablePermissions('interviewer', 'api_key')).not.toContain('report:read');
  });

  it('can be used by keys for feedback reads, since an interviewer-level key is harmless', () => {
    expect(isForbiddenFor('api_key', 'feedback:read')).toBe(false);
  });
});

describe('clients and shortlists (PRODUCT.md §3.5)', () => {
  it('lets every role read clients, recruiters and up manage them, and keeps sending a shortlist with a person', () => {
    expect(ROLES.filter((role) => roleHasPermission(role, 'client:read'))).toEqual([...ROLES]);
    expect(ROLES.filter((role) => roleHasPermission(role, 'client:manage'))).toEqual(['owner', 'admin', 'recruiter']);
    expect(ROLES.filter((role) => roleHasPermission(role, 'shortlist:send'))).toEqual(['owner', 'admin', 'recruiter']);
    expect(ROLES.filter((role) => roleHasPermission(role, 'shortlist:read'))).toEqual(['owner', 'admin', 'recruiter', 'hiring_manager']);
    for (const type of ['api_key', 'agent'] as const) {
      expect(isForbiddenFor(type, 'shortlist:send')).toBe(true);
      expect(isForbiddenFor(type, 'client:manage')).toBe(true);
      expect(isForbiddenFor(type, 'client:read')).toBe(false);
    }
  });
});
