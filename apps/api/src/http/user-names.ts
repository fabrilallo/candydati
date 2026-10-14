import type { UserDirectory } from '@tt/core';
import type { UserNames } from './audit-dto.js';

export type UserNameLookup = (organizationId: string, userIds: readonly string[]) => Promise<UserNames>;

/**
 * Display names for a page of rows, through the core directory: only members of the organization and people who acted
 * in it are named, so a user of another organization is never revealed. One query per page.
 */
export const createUserNameLookup =
  (users: UserDirectory): UserNameLookup =>
  async (organizationId, userIds) => {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    return new Map(Object.entries(await users.actorNamesOf(organizationId, unique)));
  };
