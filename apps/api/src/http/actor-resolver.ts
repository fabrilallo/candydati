import type { Actor } from '@tt/core';
import { isRole } from '@tt/domain';
import { ForbiddenError, UnauthenticatedError } from './errors.js';

export interface SessionInfo {
  readonly userId: string;
  readonly activeOrganizationId: string | null;
}

export interface ActorResolverDeps {
  readonly getSession: (headers: Headers) => Promise<SessionInfo | null>;
  readonly findRole: (userId: string, organizationId: string) => Promise<string | null>;
}

/** session -> active organization -> membership role -> core Actor. */
export function createActorResolver({ getSession, findRole }: ActorResolverDeps) {
  return async (headers: Headers): Promise<Actor> => {
    const session = await getSession(headers);
    if (!session) throw new UnauthenticatedError();
    const organizationId = session.activeOrganizationId;
    if (!organizationId) throw new ForbiddenError('No active organization.');
    const role = await findRole(session.userId, organizationId);
    if (!isRole(role)) throw new ForbiddenError('You are not a member of this organization.');
    return { type: 'user', id: session.userId, organizationId, role, onBehalfOfUserId: null };
  };
}

export type ActorResolver = ReturnType<typeof createActorResolver>;
