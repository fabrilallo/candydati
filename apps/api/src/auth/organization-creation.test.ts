import { describe, expect, it } from 'vitest';
import { organizationCreationAllowed, organizationCreationHooks, type OrganizationCreationLookups } from './organization-creation.js';

interface FakeLookups extends OrganizationCreationLookups {
  readonly claims: string[];
  readonly records: string[];
}

/** `taken`: accounts whose one_per_user slot is used; a claim takes a free slot, as the table does. */
const lookups = (taken: readonly string[], firstOwner: string | null): FakeLookups => {
  const used = new Set(taken);
  const claims: string[] = [];
  const records: string[] = [];
  return {
    claims,
    records,
    creationSlotTaken: async (userId) => used.has(userId),
    claimCreationSlot: async (userId) => {
      claims.push(userId);
      if (used.has(userId)) return false;
      used.add(userId);
      return true;
    },
    recordCreation: async (userId, organizationId) => {
      records.push(`${userId}:${organizationId}`);
    },
    firstOwnerId: async () => firstOwner,
  };
};
const ada = { id: 'u_ada', email: 'Ada@Acme.example' };
const NOW = new Date('2026-10-14T10:00:00Z');
const onePerUser = { mode: 'one_per_user', instanceAdmins: [] } as const;

describe('organizationCreationAllowed (L2)', () => {
  it('open: any confirmed account, any number of times', async () => {
    expect(await organizationCreationAllowed({ mode: 'open', instanceAdmins: [] }, ada, lookups(['u_ada'], null), NOW)).toBe(true);
  });

  it('one_per_user: a person who already created an organization cannot create another', async () => {
    expect(await organizationCreationAllowed(onePerUser, ada, lookups([], null), NOW)).toBe(true);
    expect(await organizationCreationAllowed(onePerUser, ada, lookups(['u_ada'], null), NOW)).toBe(false);
  });

  it('one_per_user: the instance admins are not limited', async () => {
    expect(await organizationCreationAllowed({ mode: 'one_per_user', instanceAdmins: ['ada@acme.example'] }, ada, lookups(['u_ada'], null), NOW)).toBe(true);
  });

  it('instance_admins: only the first owner and the listed addresses', async () => {
    const policy = { mode: 'instance_admins', instanceAdmins: ['ops@acme.example'] } as const;
    expect(await organizationCreationAllowed(policy, ada, lookups([], 'u_other'), NOW)).toBe(false);
    expect(await organizationCreationAllowed(policy, ada, lookups(['u_ada'], 'u_ada'), NOW)).toBe(true);
    expect(await organizationCreationAllowed(policy, { id: 'u_ops', email: 'OPS@acme.example' }, lookups([], 'u_other'), NOW)).toBe(true);
  });
});

describe('organizationCreationHooks (one_per_user enforcement)', () => {
  const organization = { id: 'org_1' };

  it('claims the slot before the organization exists, and refuses with the Better Auth code when it is taken', async () => {
    const l = lookups([], null);
    const hooks = organizationCreationHooks(onePerUser, l, () => NOW);
    await expect(hooks.beforeCreateOrganization({ user: ada })).resolves.toBeUndefined();
    await expect(hooks.beforeCreateOrganization({ user: ada })).rejects.toMatchObject({ statusCode: 403, body: { code: 'YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION' } });
    expect(l.claims).toEqual(['u_ada', 'u_ada']);
  });

  it('never claims for an instance admin, in open mode or in instance_admins mode', async () => {
    const l = lookups(['u_ada'], null);
    for (const policy of [{ ...onePerUser, instanceAdmins: ['ada@acme.example'] }, { mode: 'open', instanceAdmins: [] }, { mode: 'instance_admins', instanceAdmins: [] }] as const) {
      await expect(organizationCreationHooks(policy, l, () => NOW).beforeCreateOrganization({ user: ada })).resolves.toBeUndefined();
    }
    expect(l.claims).toEqual([]);
  });

  it('records every created organization, whatever the mode', async () => {
    const l = lookups([], null);
    await organizationCreationHooks({ mode: 'open', instanceAdmins: [] }, l, () => NOW).afterCreateOrganization({ organization, user: ada });
    expect(l.records).toEqual(['u_ada:org_1']);
  });
});
