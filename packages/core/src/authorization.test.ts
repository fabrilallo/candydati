import { PERMISSIONS, ROLES, roleHasPermission } from '@tt/domain';
import { describe, expect, it } from 'vitest';
import { authorize, can } from './authorization.js';
import { ForbiddenError } from './errors.js';
import { userActor } from './testing/index.js';

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
