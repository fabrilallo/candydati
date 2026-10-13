import { and, eq, inArray, schema } from '@tt/db';
import type { UserDirectory } from '../candidate-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Names of users who are members of the organization: a user of another organization is never revealed. */
export function createDrizzleUserDirectory(db: DbExecutor): UserDirectory {
  const { user, member } = schema;
  return {
    async namesOf(organizationId, userIds) {
      if (userIds.length === 0) return {};
      const rows = await db
        .select({ id: user.id, name: user.name })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(and(eq(member.organizationId, organizationId), inArray(member.userId, [...userIds])));
      return Object.fromEntries(rows.map((row) => [row.id, row.name]));
    },
  };
}
