import { describe, expect, it } from 'vitest';
import { signupAllowed, type SignupLookups, type SignupPolicy } from './signup-policy.js';

const lookups = (bootstrapOpen: boolean, invited: readonly string[]): SignupLookups & { claims: string[] } => {
  const claims: string[] = [];
  return {
    claims,
    hasPendingInvitation: async (email) => invited.includes(email),
    claimBootstrap: async (email) => {
      claims.push(email);
      return bootstrapOpen;
    },
  };
};
const NOW = new Date('2026-10-14T10:00:00Z');
const open: SignupPolicy = { mode: 'open', bootstrapToken: null, requireBootstrapToken: false };
const inviteOnly: SignupPolicy = { mode: 'invite_only', bootstrapToken: null, requireBootstrapToken: false };
const production: SignupPolicy = { mode: 'invite_only', bootstrapToken: 'b'.repeat(32), requireBootstrapToken: true };

describe('signupAllowed', () => {
  it('lets anyone in when open', async () => {
    expect(await signupAllowed(open, 'a@x.it', null, lookups(false, []), NOW)).toBe(true);
  });

  it('when invite only, needs a pending invitation for the address (any casing)', async () => {
    expect(await signupAllowed(inviteOnly, 'Ada@X.it ', null, lookups(false, ['ada@x.it']), NOW)).toBe(true);
    expect(await signupAllowed(inviteOnly, 'eve@x.it', null, lookups(false, ['ada@x.it']), NOW)).toBe(false);
  });

  it('when invite only, lets the first owner claim the bootstrap (normalised address)', async () => {
    const l = lookups(true, []);
    expect(await signupAllowed(inviteOnly, ' Owner@X.it', null, l, NOW)).toBe(true);
    expect(l.claims).toEqual(['owner@x.it']);
  });

  it('in production, the bootstrap needs the one-time BOOTSTRAP_TOKEN, and nothing is claimed without it', async () => {
    const l = lookups(true, []);
    expect(await signupAllowed(production, 'owner@x.it', null, l, NOW)).toBe(false);
    expect(await signupAllowed(production, 'owner@x.it', 'wrong', l, NOW)).toBe(false);
    expect(l.claims).toEqual([]);
    expect(await signupAllowed(production, 'owner@x.it', 'b'.repeat(32), l, NOW)).toBe(true);
  });

  it('in production without a BOOTSTRAP_TOKEN configured, nobody can bootstrap', async () => {
    const l = lookups(true, []);
    expect(await signupAllowed({ ...production, bootstrapToken: null }, 'owner@x.it', '', l, NOW)).toBe(false);
  });

  it('an invitation never needs the token', async () => {
    expect(await signupAllowed(production, 'ada@x.it', null, lookups(false, ['ada@x.it']), NOW)).toBe(true);
  });

  it('refuses once the bootstrap is closed (a confirmed account exists or another address holds it)', async () => {
    expect(await signupAllowed(production, 'late@x.it', 'b'.repeat(32), lookups(false, []), NOW)).toBe(false);
  });
});
