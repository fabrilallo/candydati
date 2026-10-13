import { eq, schema } from '@tt/db';
import type { MemberDirectory } from '../automation-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Members of one organization with the address their digest goes to. Never crosses organizations. */
export function createDrizzleMemberDirectory(db: DbExecutor): MemberDirectory {
  const { user, member } = schema;
  return {
    async list(organizationId) {
      const rows = await db
        .select({ userId: member.userId, role: member.role, name: user.name, email: user.email })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, organizationId));
      return rows.map((row) => ({
        userId: row.userId,
        name: row.name,
        email: row.email,
        roles: row.role.split(',').map((role) => role.trim()).filter(Boolean),
      }));
    },
  };
}
