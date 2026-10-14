import { and, eq, inArray, or, schema } from '@tt/db';
import { exists } from 'drizzle-orm';
import type { UserDirectory } from '../candidate-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Names of users who are members of the organization: a user of another organization is never revealed. */
export function createDrizzleUserDirectory(db: DbExecutor): UserDirectory {
  const { user, member, auditLog } = schema;
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
    async actorNamesOf(organizationId, userIds) {
      if (userIds.length === 0) return {};
      const isMember = db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, organizationId), eq(member.userId, user.id)));
      const actedHere = db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.organizationId, organizationId), eq(auditLog.actorId, user.id)));
      const rows = await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(and(inArray(user.id, [...userIds]), or(exists(isMember), exists(actedHere))));
      return Object.fromEntries(rows.map((row) => [row.id, row.name]));
    },
  };
}
