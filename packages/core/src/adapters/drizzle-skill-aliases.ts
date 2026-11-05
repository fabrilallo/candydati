import { and, asc, eq, schema } from '@candydati/db';
import { ConflictError } from '../errors.js';
import type { SkillAliasRecord, SkillAliasRepository } from '../skill-alias-ports.js';
import { isUniqueViolation, type DbExecutor } from './db-executor.js';

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleSkillAliases(db: DbExecutor): SkillAliasRepository {
  const { skillAlias, skillAliasDisabled } = schema;
  return {
    async load(organizationId) {
      const aliases = await db.select().from(skillAlias).where(eq(skillAlias.organizationId, organizationId)).orderBy(asc(skillAlias.createdAt), asc(skillAlias.id));
      const disabled = await db.select({ key: skillAliasDisabled.aliasKey }).from(skillAliasDisabled).where(eq(skillAliasDisabled.organizationId, organizationId));
      return { aliases, disabled: disabled.map((row) => row.key) };
    },
    async add(record: SkillAliasRecord) {
      try {
        const [row] = await db.insert(skillAlias).values(record).returning();
        if (!row) throw new Error('skill_alias insert returned no row');
        return row;
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('alias_taken');
        throw error;
      }
    },
    async remove(organizationId, id) {
      const [row] = await db.delete(skillAlias).where(and(eq(skillAlias.organizationId, organizationId), eq(skillAlias.id, id))).returning();
      return row ?? null;
    },
    async disable(organizationId, aliasKey, by, at) {
      const rows = await db
        .insert(skillAliasDisabled)
        .values({ organizationId, aliasKey, disabledBy: by, disabledAt: at })
        .onConflictDoNothing()
        .returning({ key: skillAliasDisabled.aliasKey });
      return rows.length > 0;
    },
    async enable(organizationId, aliasKey) {
      const rows = await db
        .delete(skillAliasDisabled)
        .where(and(eq(skillAliasDisabled.organizationId, organizationId), eq(skillAliasDisabled.aliasKey, aliasKey)))
        .returning({ key: skillAliasDisabled.aliasKey });
      return rows.length > 0;
    },
  };
}
