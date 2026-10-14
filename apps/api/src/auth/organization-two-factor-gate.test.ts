import { describe, expect, it } from 'vitest';
import { isGatedOrganizationPath, organizationChangeAllowed, type OrganizationGateLookups } from './organization-two-factor-gate.js';

const lookups = (roles: Record<string, string>, requiring: readonly string[], invitations: Record<string, string> = {}): OrganizationGateLookups => ({
  roleOf: async (_userId, organizationId) => roles[organizationId] ?? null,
  requiresTwoFactor: async (organizationId) => requiring.includes(organizationId),
  organizationOfInvitation: async (invitationId) => invitations[invitationId] ?? null,
});
const owner = { userId: 'u1', twoFactorEnabled: false, activeOrganizationId: 'o1' };

describe('organization 2FA gate', () => {
  it('gates every organization endpoint except reads, one’s own invitation, leaving and creating', () => {
    for (const path of ['/organization/invite-member', '/organization/update', '/organization/update-member-role', '/organization/remove-member', '/organization/cancel-invitation', '/organization/some-future-endpoint']) {
      expect(isGatedOrganizationPath(path)).toBe(true);
    }
    for (const path of ['/organization/create', '/organization/set-active', '/organization/accept-invitation', '/organization/leave', '/organization/get-full-organization', '/sign-in/email', '/two-factor/enable']) {
      expect(isGatedOrganizationPath(path)).toBe(false);
    }
  });

  it('refuses an owner or admin without 2FA in an organization that requires it', async () => {
    expect(await organizationChangeAllowed('/organization/update', {}, owner, lookups({ o1: 'owner' }, ['o1']))).toBe(false);
    expect(await organizationChangeAllowed('/organization/update', {}, owner, lookups({ o1: 'admin' }, ['o1']))).toBe(false);
  });

  it('lets through people with 2FA, roles it does not cover, organizations that do not require it, and no session', async () => {
    expect(await organizationChangeAllowed('/organization/update', {}, { ...owner, twoFactorEnabled: true }, lookups({ o1: 'owner' }, ['o1']))).toBe(true);
    expect(await organizationChangeAllowed('/organization/update', {}, owner, lookups({ o1: 'recruiter' }, ['o1']))).toBe(true);
    expect(await organizationChangeAllowed('/organization/update', {}, owner, lookups({ o1: 'owner' }, []))).toBe(true);
    expect(await organizationChangeAllowed('/organization/update', {}, null, lookups({}, ['o1']))).toBe(true);
  });

  it('checks the organization named in the body and the one of the invitation, not only the active one', async () => {
    const free = { ...owner, activeOrganizationId: 'free' };
    const l = lookups({ free: 'owner', o1: 'owner' }, ['o1'], { inv_1: 'o1' });
    expect(await organizationChangeAllowed('/organization/update', { organizationId: 'o1' }, free, l)).toBe(false);
    expect(await organizationChangeAllowed('/organization/cancel-invitation', { invitationId: 'inv_1' }, free, l)).toBe(false);
    expect(await organizationChangeAllowed('/organization/cancel-invitation', { invitationId: 'unknown' }, free, l)).toBe(true);
  });
});
