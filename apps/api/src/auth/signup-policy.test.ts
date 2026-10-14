import { describe, expect, it } from 'vitest';
import { emailVerificationCheck, signupAllowed, verificationAllowed, type SignupLookups, type SignupPolicy } from './signup-policy.js';

/** `bootstrapOwner`: the address whose verification makes it the first owner (it holds the live claim). */
const lookups = (bootstrapOpen: boolean, invited: readonly string[], bootstrapOwner: string | null = null): SignupLookups & { claims: string[]; owners: string[] } => {
  const claims: string[] = [];
  const owners: string[] = [];
  return {
    claims,
    owners,
    hasPendingInvitation: async (email) => invited.includes(email),
    claimBootstrap: async (email) => {
      claims.push(email);
      return bootstrapOpen;
    },
    confirmBootstrapOwner: async (user) => {
      if (user.email !== bootstrapOwner) return false;
      owners.push(user.id);
      return true;
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

describe('verificationAllowed (the bootstrap claim is checked again when the address is confirmed)', () => {
  const ada = { id: 'u_ada', email: 'Ada@X.it' };

  it('confirms anyone when open, and nothing is recorded', async () => {
    const l = lookups(false, [], 'ada@x.it');
    expect(await verificationAllowed(open, ada, l, NOW)).toBe(true);
    expect(l.owners).toEqual([]);
  });

  it('when invite only, confirms an address with a pending invitation', async () => {
    expect(await verificationAllowed(inviteOnly, ada, lookups(false, ['ada@x.it']), NOW)).toBe(true);
  });

  it('when invite only, records the holder of the live bootstrap claim as the first owner', async () => {
    const l = lookups(false, [], 'ada@x.it');
    expect(await verificationAllowed(inviteOnly, ada, l, NOW)).toBe(true);
    expect(l.owners).toEqual(['u_ada']);
  });

  it('when invite only, refuses an account admitted by a claim that lapsed or was taken over', async () => {
    expect(await verificationAllowed(inviteOnly, ada, lookups(false, [], 'other@x.it'), NOW)).toBe(false);
  });

  it('emailVerificationCheck refuses with SIGNUP_INVITE_ONLY', async () => {
    const check = emailVerificationCheck(inviteOnly, lookups(false, []), () => NOW);
    await expect(check(ada)).rejects.toMatchObject({ statusCode: 403, body: { code: 'SIGNUP_INVITE_ONLY' } });
    await expect(emailVerificationCheck(inviteOnly, lookups(false, ['ada@x.it']), () => NOW)(ada)).resolves.toBeUndefined();
  });

  it('sends a refused link back to its in-app callback with ?error=SIGNUP_INVITE_ONLY, so the person sees a page', async () => {
    const check = emailVerificationCheck(inviteOnly, lookups(false, []), () => NOW);
    const link = (callbackURL: string) => new Request(`https://ats.example.com/api/auth/verify-email?token=t&callbackURL=${encodeURIComponent(callbackURL)}`);
    const refusal = check(ada, link('/verify-email?next=%2Fonboarding'));
    await expect(refusal).rejects.toMatchObject({ statusCode: 302 });
    const location = await refusal.catch((error: { headers: Headers }) => error.headers.get('location'));
    expect(location).toBe('/verify-email?next=%2Fonboarding&error=SIGNUP_INVITE_ONLY');
  });

  it('never redirects outside the app: an absolute or protocol-relative callback gets the plain 403', async () => {
    const check = emailVerificationCheck(inviteOnly, lookups(false, []), () => NOW);
    for (const callbackURL of ['https://evil.example/x', '//evil.example/x', '/\\evil.example']) {
      const request = new Request(`https://ats.example.com/api/auth/verify-email?token=t&callbackURL=${encodeURIComponent(callbackURL)}`);
      await expect(check(ada, request)).rejects.toMatchObject({ statusCode: 403, body: { code: 'SIGNUP_INVITE_ONLY' } });
    }
    await expect(check(ada, new Request('https://ats.example.com/api/auth/verify-email?token=t'))).rejects.toMatchObject({ statusCode: 403 });
  });
});
