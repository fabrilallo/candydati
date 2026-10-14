import { describe, expect, it, vi } from 'vitest';
import { createActorResolver, type SessionInfo } from './actor-resolver.js';
import { ForbiddenError, UnauthenticatedError, type AccountGateError } from './errors.js';

const resolver = (session: Omit<SessionInfo, 'emailVerified' | 'twoFactorEnabled'> | null, role: string | null) =>
  createActorResolver({
    getSession: async () => (session ? { emailVerified: true, twoFactorEnabled: false, ...session } : null),
    findRole: vi.fn(async () => role),
    requiresTwoFactor: async () => false,
  });

const headers = new Headers();

describe('actor resolver', () => {
  it('builds a user actor from the session and the membership role', async () => {
    await expect(resolver({ userId: 'u1', activeOrganizationId: 'o1' }, 'admin')(headers)).resolves.toEqual({
      type: 'user',
      id: 'u1',
      organizationId: 'o1',
      role: 'admin',
      onBehalfOfUserId: null,
    });
  });

  it('is unauthenticated without a session', async () => {
    await expect(resolver(null, null)(headers)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('is forbidden without an active organization, and does not look up a role', async () => {
    const findRole = vi.fn();
    const resolve = createActorResolver({ getSession: async () => ({ userId: 'u1', activeOrganizationId: null, emailVerified: true, twoFactorEnabled: false }), findRole, requiresTwoFactor: async () => false });
    await expect(resolve(headers)).rejects.toBeInstanceOf(ForbiddenError);
    expect(findRole).not.toHaveBeenCalled();
  });

  it.each([null, 'member', 'owner,admin', ''])('is forbidden when the membership role is %o', async (role) => {
    await expect(resolver({ userId: 'u1', activeOrganizationId: 'o1' }, role)(headers)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('actor resolver account gates', () => {
  const session = (patch: Partial<SessionInfo> = {}): SessionInfo => ({ userId: 'u1', activeOrganizationId: 'o1', emailVerified: true, twoFactorEnabled: false, ...patch });
  const gate = async (promise: Promise<unknown>) => ((await promise.catch((error: unknown) => error)) as AccountGateError).code;

  it('refuses a session whose email is not confirmed (one that predates verification)', async () => {
    const resolve = createActorResolver({ getSession: async () => session({ emailVerified: false }), findRole: async () => 'owner', requiresTwoFactor: async () => false });
    expect(await gate(resolve(headers))).toBe('email_not_verified');
  });

  it('when the organization requires 2FA, refuses owners and admins without it, lets other roles through', async () => {
    const requiresTwoFactor = vi.fn(async () => true);
    const as = (role: string, twoFactorEnabled: boolean) =>
      createActorResolver({ getSession: async () => session({ twoFactorEnabled }), findRole: async () => role, requiresTwoFactor })(headers);
    expect(await gate(as('owner', false))).toBe('two_factor_required');
    expect(await gate(as('admin', false))).toBe('two_factor_required');
    await expect(as('admin', true)).resolves.toMatchObject({ role: 'admin' });
    await expect(as('recruiter', false)).resolves.toMatchObject({ role: 'recruiter' });
    expect(requiresTwoFactor).toHaveBeenCalledWith('o1');
  });
});
