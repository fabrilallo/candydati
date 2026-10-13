import { AGENT_EXTRA_FORBIDDEN, MACHINE_FORBIDDEN_PERMISSIONS, PERMISSIONS, ROLES, roleHasPermission } from '@tt/domain';
import { describe, expect, it } from 'vitest';
import { authorize, can } from './authorization.js';
import { ForbiddenError } from './errors.js';
import { agentActor, apiKeyActor, userActor } from './testing/index.js';

describe('authorize', () => {
  it.each(ROLES.flatMap((role) => PERMISSIONS.map((permission) => [role, permission] as const)))(
    '%s / %s follows the domain grants',
    (role, permission) => {
      const actor = userActor({ role });
      if (roleHasPermission(role, permission)) expect(() => authorize(actor, permission)).not.toThrow();
      else expect(() => authorize(actor, permission)).toThrow(ForbiddenError);
    },
  );

  it('allows access to the actor organization', () => {
    const actor = userActor({ role: 'admin', organizationId: 'org_a' });
    expect(() => authorize(actor, 'audit:read', 'org_a')).not.toThrow();
  });

  it('always denies another organization, even for an owner', () => {
    const actor = userActor({ role: 'owner', organizationId: 'org_a' });
    expect(() => authorize(actor, 'audit:read', 'org_b')).toThrow(ForbiddenError);
  });

  it('gives an agent exactly the permissions of the user it acts for', () => {
    expect(can(userActor({ role: 'recruiter' }), 'audit:read')).toBe(false);
    expect(can(userActor({ role: 'admin' }), 'audit:read')).toBe(true);
  });
});

describe('authorize for machines', () => {
  it.each(ROLES.flatMap((role) => PERMISSIONS.map((permission) => [role, permission] as const)))(
    'api key %s / %s: role minus the forbidden list, scopes absent',
    (role, permission) => {
      const allowed = roleHasPermission(role, permission) && !MACHINE_FORBIDDEN_PERMISSIONS.includes(permission);
      expect(can(apiKeyActor({ role }), permission)).toBe(allowed);
    },
  );

  it.each(ROLES.flatMap((role) => PERMISSIONS.map((permission) => [role, permission] as const)))(
    'agent %s / %s: role minus both forbidden lists',
    (role, permission) => {
      const allowed =
        roleHasPermission(role, permission) &&
        !MACHINE_FORBIDDEN_PERMISSIONS.includes(permission) &&
        !AGENT_EXTRA_FORBIDDEN.includes(permission);
      expect(can(agentActor({ role }), permission)).toBe(allowed);
    },
  );

  it('requires the permission in the scopes as well as in the role', () => {
    const key = apiKeyActor({ role: 'owner', scopes: ['job:read'] });
    expect(() => authorize(key, 'job:read')).not.toThrow();
    expect(() => authorize(key, 'job:create')).toThrow(ForbiddenError);
  });

  it('never lets a scope exceed the role', () => {
    const key = apiKeyActor({ role: 'interviewer', scopes: ['job:read', 'job:create'] });
    expect(can(key, 'job:create')).toBe(false);
  });

  it('refuses forbidden permissions even when the scopes (wrongly) list them', () => {
    const key = apiKeyActor({ role: 'owner', scopes: ['candidate:decide', 'message:send', 'member:delete', 'api_key:manage'] });
    for (const permission of ['candidate:decide', 'message:send', 'member:delete', 'api_key:manage'] as const) {
      expect(() => authorize(key, permission)).toThrow(ForbiddenError);
    }
  });

  it('refuses the agent candidate:move, which a key may hold', () => {
    expect(() => authorize(agentActor({ role: 'recruiter' }), 'candidate:move')).toThrow(ForbiddenError);
    expect(() => authorize(apiKeyActor({ role: 'recruiter', scopes: ['candidate:move'] }), 'candidate:move')).not.toThrow();
  });

  it('treats null scopes as the full role set for users and keeps users free of the machine lists', () => {
    expect(can(userActor({ role: 'owner', scopes: null }), 'candidate:decide')).toBe(true);
    expect(can(userActor({ role: 'owner', scopes: ['job:read'] }), 'job:create')).toBe(false);
  });
});
