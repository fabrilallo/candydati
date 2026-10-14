import type { Actor } from '@tt/core';
import { isRole, roleNeedsTwoFactor } from '@tt/domain';
import { AccountGateError, ForbiddenError, UnauthenticatedError } from './errors.js';

export interface SessionInfo {
  readonly userId: string;
  readonly activeOrganizationId: string | null;
  readonly emailVerified: boolean;
  readonly twoFactorEnabled: boolean;
}

export interface ActorResolverDeps {
  readonly getSession: (headers: Headers) => Promise<SessionInfo | null>;
  readonly findRole: (userId: string, organizationId: string) => Promise<string | null>;
  /** The organization's security setting: owners and admins need 2FA. */
  readonly requiresTwoFactor: (organizationId: string) => Promise<boolean>;
}

/**
 * session -> confirmed email -> active organization -> membership role -> 2FA when required -> core Actor.
 * A session of an unconfirmed address (one created before verification was required) is not enough for the app.
 */
export function createActorResolver({ getSession, findRole, requiresTwoFactor }: ActorResolverDeps) {
  return async (headers: Headers): Promise<Actor> => {
    const session = await getSession(headers);
    if (!session) throw new UnauthenticatedError();
    if (!session.emailVerified) throw new AccountGateError('email_not_verified', 'Confirm your email address first.');
    const organizationId = session.activeOrganizationId;
    if (!organizationId) throw new ForbiddenError('No active organization.');
    const role = await findRole(session.userId, organizationId);
    if (!isRole(role)) throw new ForbiddenError('You are not a member of this organization.');
    if (roleNeedsTwoFactor(role) && !session.twoFactorEnabled && (await requiresTwoFactor(organizationId))) {
      throw new AccountGateError('two_factor_required', 'This organization requires two-factor authentication for your role.');
    }
    return { type: 'user', id: session.userId, organizationId, role, onBehalfOfUserId: null };
  };
}

export type ActorResolver = ReturnType<typeof createActorResolver>;
