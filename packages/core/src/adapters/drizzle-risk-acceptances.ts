import { and, eq, schema } from '@candydati/db';
import type { SourcingRiskAcceptanceRepository } from '../sourcing-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Postgres implementation, per organization and person. */
export function createDrizzleRiskAcceptances(db: DbExecutor): SourcingRiskAcceptanceRepository {
  const { sourcingRiskAcceptance: t } = schema;
  return {
    async find(organizationId, userId) {
      const [row] = await db.select().from(t).where(and(eq(t.organizationId, organizationId), eq(t.userId, userId))).limit(1);
      return row ? { textVersion: row.textVersion, acceptedAt: row.acceptedAt } : null;
    },
    async accept(organizationId, userId, textVersion, at) {
      await db.insert(t).values({ organizationId, userId, textVersion, acceptedAt: at }).onConflictDoUpdate({ target: [t.organizationId, t.userId], set: { textVersion, acceptedAt: at } });
    },
  };
}
