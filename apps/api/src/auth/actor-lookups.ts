import type { Db } from '@candydati/db';
import type { ActorLookups } from './audit-hooks.js';
import { findMemberRole } from './member-role.js';
import { currentRequestHeaders } from './request-context.js';

export type SessionUserResolver = (headers: Headers) => Promise<string | null>;

/** Resolves actors for audit hooks from the in-flight request (session) and the member table (role). */
export function createActorLookups(db: Db, sessionUserId: () => SessionUserResolver): ActorLookups {
  return {
    async currentUserId() {
      const headers = currentRequestHeaders();
      return headers ? sessionUserId()(headers) : null;
    },
    roleOf: (userId, organizationId) => findMemberRole(db, userId, organizationId),
  };
}
