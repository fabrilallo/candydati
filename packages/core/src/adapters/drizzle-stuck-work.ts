import { and, asc, eq, inArray, lt, schema } from '@candydati/db';
import type { StuckWorkRepository, UnfinishedMigrationStatus } from '../reconcile-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Postgres implementation. Spans organizations on purpose: only the reconciler (a system job) reads it. */
export function createDrizzleStuckWork(db: DbExecutor): StuckWorkRepository {
  const { message, dataExport, importBatch, cvExtraction, migrationBatch } = schema;
  const waiting: readonly UnfinishedMigrationStatus[] = ['uploaded', 'analyzing', 'importing'];
  return {
    queuedMessages: (before, limit) =>
      db
        .select({ organizationId: message.organizationId, id: message.id })
        .from(message)
        .where(and(eq(message.status, 'queued'), eq(message.direction, 'outbound'), lt(message.createdAt, before)))
        .orderBy(asc(message.createdAt), asc(message.id))
        .limit(limit),
    pendingExports: (before, limit) =>
      db
        .select({ organizationId: dataExport.organizationId, id: dataExport.id })
        .from(dataExport)
        .where(and(eq(dataExport.status, 'pending'), lt(dataExport.createdAt, before)))
        .orderBy(asc(dataExport.createdAt), asc(dataExport.id))
        .limit(limit),
    pendingExtractions: (before, limit) =>
      db
        .select({ organizationId: cvExtraction.organizationId, id: cvExtraction.applicationId })
        .from(cvExtraction)
        .where(and(eq(cvExtraction.status, 'pending'), lt(cvExtraction.updatedAt, before)))
        .orderBy(asc(cvExtraction.updatedAt), asc(cvExtraction.applicationId))
        .limit(limit),
    async unfinishedImports(before, limit) {
      const rows = await db
        .select({ organizationId: importBatch.organizationId, id: importBatch.id, status: importBatch.status })
        .from(importBatch)
        .where(and(inArray(importBatch.status, ['uploaded', 'importing']), lt(importBatch.createdAt, before)))
        .orderBy(asc(importBatch.createdAt), asc(importBatch.id))
        .limit(limit);
      return rows.map((row) => ({ ...row, status: row.status === 'uploaded' ? 'uploaded' : 'importing' }));
    },
    async unfinishedMigrations(before, limit) {
      const rows = await db
        .select({ organizationId: migrationBatch.organizationId, id: migrationBatch.id, status: migrationBatch.status })
        .from(migrationBatch)
        .where(and(inArray(migrationBatch.status, [...waiting]), lt(migrationBatch.updatedAt, before)))
        .orderBy(asc(migrationBatch.updatedAt), asc(migrationBatch.id))
        .limit(limit);
      return rows.flatMap((row) => {
        const status = waiting.find((value) => value === row.status);
        return status === undefined ? [] : [{ organizationId: row.organizationId, id: row.id, status }];
      });
    },
  };
}
