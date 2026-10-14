import { describe, expect, it } from 'vitest';
import { signupAllowed, type SignupLookups } from './signup-policy.js';

const lookups = (users: boolean, invited: readonly string[]): SignupLookups => ({
  hasAnyUser: async () => users,
  hasPendingInvitation: async (email) => invited.includes(email),
});
const NOW = new Date('2026-10-14T10:00:00Z');

describe('signupAllowed', () => {
  it('lets anyone in when open', async () => {
    expect(await signupAllowed('open', 'a@x.it', lookups(true, []), NOW)).toBe(true);
  });

  it('when invite only, needs a pending invitation for the address (any casing)', async () => {
    expect(await signupAllowed('invite_only', 'Ada@X.it ', lookups(true, ['ada@x.it']), NOW)).toBe(true);
    expect(await signupAllowed('invite_only', 'eve@x.it', lookups(true, ['ada@x.it']), NOW)).toBe(false);
  });

  it('when invite only, allows the very first account of the instance (its first owner)', async () => {
    expect(await signupAllowed('invite_only', 'owner@x.it', lookups(false, []), NOW)).toBe(true);
  });
});
