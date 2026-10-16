import { and, desc, eq, schema } from '@candydati/db';
import { ROLES, type ApiKey, type Role } from '@candydati/domain';
import type { ApiKeyRepository, MemberRoleLookup } from '../api-key-ports.js';
import type { DbExecutor } from './db-executor.js';

type Row = typeof schema.apiKey.$inferSelect;

const toKey = (row: Row): ApiKey => ({ ...row });

export function createDrizzleApiKeys(db: DbExecutor): ApiKeyRepository {
  const { apiKey } = schema;
  const inOrg = (organizationId: string) => eq(apiKey.organizationId, organizationId);
  return {
    async create(key) {
      const [row] = await db.insert(apiKey).values({ ...key, scopes: [...key.scopes] }).returning();
      if (!row) throw new Error('api key insert returned no row');
      return toKey(row);
    },
    async save(key) {
      const { id, organizationId, ...values } = key;
      const [row] = await db
        .update(apiKey)
        .set({ ...values, scopes: [...values.scopes] })
        .where(and(inOrg(organizationId), eq(apiKey.id, id)))
        .returning();
      if (!row) throw new Error('api key not found for save');
      return toKey(row);
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(apiKey).where(and(inOrg(organizationId), eq(apiKey.id, id))).limit(1);
      return row ? toKey(row) : null;
    },
    async findByPrefix(prefix) {
      const [row] = await db.select().from(apiKey).where(eq(apiKey.prefix, prefix)).limit(1);
      return row ? toKey(row) : null;
    },
    async list(organizationId) {
      const rows = await db.select().from(apiKey).where(inOrg(organizationId)).orderBy(desc(apiKey.createdAt), desc(apiKey.id));
      return rows.map(toKey);
    },
    async touch(organizationId, id, at) {
      await db.update(apiKey).set({ lastUsedAt: at }).where(and(inOrg(organizationId), eq(apiKey.id, id)));
    },
  };
}

/** `member.role` may hold several comma-separated roles; the most powerful one counts (ROLES is ordered by power). */
export const strongestRole = (stored: string): Role | null => {
  const roles = stored.split(',').map((role) => role.trim());
  return ROLES.find((role) => roles.includes(role)) ?? null;
};

/** Membership of one user in one organization: a member of another organization is no member here. */
export function createDrizzleMemberRoles(db: DbExecutor): MemberRoleLookup {
  const { member } = schema;
  return {
    async roleOf(organizationId, userId) {
      const [row] = await db
        .select({ role: member.role })
        .from(member)
        .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
        .limit(1);
      return row ? strongestRole(row.role) : null;
    },
  };
}
