import { and, asc, desc, eq, lte, schema } from '@tt/db';
import type { DataExport, RetentionRun } from '@tt/domain';
import type { DataExportRepository, RetentionRunRepository } from '../privacy-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Postgres implementation. Every statement filters by `organization_id` except the retention job's cross-organization list. */
export function createDrizzleRetentionRuns(db: DbExecutor): RetentionRunRepository {
  const { retentionRun } = schema;
  return {
    async create(run: RetentionRun) {
      await db.insert(retentionRun).values(run);
      return run;
    },
    listRecent: (organizationId, limit) =>
      db
        .select()
        .from(retentionRun)
        .where(eq(retentionRun.organizationId, organizationId))
        .orderBy(desc(retentionRun.startedAt), desc(retentionRun.id))
        .limit(limit),
  };
}

export function createDrizzleDataExports(db: DbExecutor): DataExportRepository {
  const { dataExport } = schema;
  const inOrg = (organizationId: string) => eq(dataExport.organizationId, organizationId);
  return {
    async create(value: DataExport) {
      await db.insert(dataExport).values(value);
      return value;
    },
    async save(value) {
      const { id, organizationId, ...values } = value;
      const [row] = await db.update(dataExport).set(values).where(and(inOrg(organizationId), eq(dataExport.id, id))).returning();
      if (!row) throw new Error('data export not found for save');
      return row;
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(dataExport).where(and(inOrg(organizationId), eq(dataExport.id, id))).limit(1);
      return row ?? null;
    },
    list: (organizationId) => db.select().from(dataExport).where(inOrg(organizationId)).orderBy(desc(dataExport.createdAt), desc(dataExport.id)),
    listExpiredAcrossOrganizations: (now) => db.select().from(dataExport).where(lte(dataExport.expiresAt, now)).orderBy(asc(dataExport.expiresAt)),
    async delete(organizationId, id) {
      const rows = await db.delete(dataExport).where(and(inOrg(organizationId), eq(dataExport.id, id))).returning({ id: dataExport.id });
      return rows.length > 0;
    },
  };
}
