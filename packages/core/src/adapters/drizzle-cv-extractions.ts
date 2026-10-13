import { and, count, eq, gte, inArray, schema } from '@tt/db';
import { cvExtractionSchema, type CvExtractionRecord } from '@tt/domain';
import type { CvExtractionRepository } from '../candidate-ports.js';
import type { DbExecutor } from './db-executor.js';

type Row = typeof schema.cvExtraction.$inferSelect;

/** jsonb is a boundary: the structured data is parsed on every read. */
const toRecord = (row: Row): CvExtractionRecord => ({
  applicationId: row.applicationId,
  organizationId: row.organizationId,
  status: row.status,
  text: row.text,
  data: row.data === null ? null : cvExtractionSchema.parse(row.data),
  source: row.source,
  updatedAt: row.updatedAt,
});

/** Postgres implementation. The generated `search` column is never written. */
export function createDrizzleCvExtractions(db: DbExecutor): CvExtractionRepository {
  const { cvExtraction } = schema;
  return {
    async upsert(record) {
      const values = {
        applicationId: record.applicationId,
        organizationId: record.organizationId,
        status: record.status,
        text: record.text,
        data: record.data,
        source: record.source,
        updatedAt: record.updatedAt,
      };
      const { applicationId, organizationId, ...changes } = values;
      const [row] = await db
        .insert(cvExtraction)
        .values(values)
        .onConflictDoUpdate({ target: cvExtraction.applicationId, set: changes, setWhere: eq(cvExtraction.organizationId, organizationId) })
        .returning();
      if (!row) throw new Error(`cv_extraction for ${applicationId} belongs to another organization`);
      return toRecord(row);
    },
    async findByApplication(organizationId, applicationId) {
      const [row] = await db
        .select()
        .from(cvExtraction)
        .where(and(eq(cvExtraction.organizationId, organizationId), eq(cvExtraction.applicationId, applicationId)))
        .limit(1);
      return row ? toRecord(row) : null;
    },
    async findByApplications(organizationId, applicationIds) {
      if (applicationIds.length === 0) return [];
      const rows = await db
        .select()
        .from(cvExtraction)
        .where(and(eq(cvExtraction.organizationId, organizationId), inArray(cvExtraction.applicationId, [...applicationIds])));
      return rows.map(toRecord);
    },
    async countFinishedSince(organizationId, since) {
      const [row] = await db
        .select({ total: count() })
        .from(cvExtraction)
        .where(and(eq(cvExtraction.organizationId, organizationId), inArray(cvExtraction.status, ['done', 'text_only']), gte(cvExtraction.updatedAt, since)));
      return row?.total ?? 0;
    },
  };
}
