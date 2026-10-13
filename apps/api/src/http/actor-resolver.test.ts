import { describe, expect, it, vi } from 'vitest';
import { createActorResolver, type SessionInfo } from './actor-resolver.js';
import { ForbiddenError, UnauthenticatedError } from './errors.js';

const resolver = (session: SessionInfo | null, role: string | null) =>
  createActorResolver({ getSession: async () => session, findRole: vi.fn(async () => role) });

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
    const resolve = createActorResolver({ getSession: async () => ({ userId: 'u1', activeOrganizationId: null }), findRole });
    await expect(resolve(headers)).rejects.toBeInstanceOf(ForbiddenError);
    expect(findRole).not.toHaveBeenCalled();
  });

  it.each([null, 'member', 'owner,admin', ''])('is forbidden when the membership role is %o', async (role) => {
    await expect(resolver({ userId: 'u1', activeOrganizationId: 'o1' }, role)(headers)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
