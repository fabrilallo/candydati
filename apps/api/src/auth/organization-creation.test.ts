import { describe, expect, it } from 'vitest';
import { organizationCreationAllowed, type OrganizationCreationLookups } from './organization-creation.js';

const lookups = (owns: readonly string[], firstOwner: string | null): OrganizationCreationLookups => ({
  ownsAnOrganization: async (userId) => owns.includes(userId),
  firstOwnerId: async () => firstOwner,
});
const ada = { id: 'u_ada', email: 'Ada@Acme.example' };

describe('organizationCreationAllowed (L2)', () => {
  it('open: any confirmed account, any number of times', async () => {
    expect(await organizationCreationAllowed({ mode: 'open', instanceAdmins: [] }, ada, lookups(['u_ada'], null))).toBe(true);
  });

  it('one_per_user: a person who already owns an organization cannot create another', async () => {
    const policy = { mode: 'one_per_user', instanceAdmins: [] } as const;
    expect(await organizationCreationAllowed(policy, ada, lookups([], null))).toBe(true);
    expect(await organizationCreationAllowed(policy, ada, lookups(['u_ada'], null))).toBe(false);
  });

  it('one_per_user: the instance admins are not limited', async () => {
    expect(await organizationCreationAllowed({ mode: 'one_per_user', instanceAdmins: ['ada@acme.example'] }, ada, lookups(['u_ada'], null))).toBe(true);
  });

  it('instance_admins: only the first owner and the listed addresses', async () => {
    const policy = { mode: 'instance_admins', instanceAdmins: ['ops@acme.example'] } as const;
    expect(await organizationCreationAllowed(policy, ada, lookups([], 'u_other'))).toBe(false);
    expect(await organizationCreationAllowed(policy, ada, lookups(['u_ada'], 'u_ada'))).toBe(true);
    expect(await organizationCreationAllowed(policy, { id: 'u_ops', email: 'OPS@acme.example' }, lookups([], 'u_other'))).toBe(true);
  });
});
