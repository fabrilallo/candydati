import { and, asc, desc, eq, inArray, isNull, lt, schema, sql } from '@candydati/db';
import { isMigrationEnded, MIGRATION_ENDED_STATUSES, type MigrationIssue, type MigrationIssueCode, type MigrationStatus } from '@candydati/domain';
import { ConflictError } from '../errors.js';
import type { MigrationBatchRepository, MigrationIssueRepository } from '../migration-ports.js';
import type { DbExecutor } from './db-executor.js';

type IssueRow = typeof schema.migrationIssue.$inferSelect;

const toIssue = (row: IssueRow): MigrationIssue => ({ ...row, code: row.code as MigrationIssueCode });

/**
 * Every column except the credentials: they are written and wiped only by the connector fetch, so a batch read for the
 * preview can never carry them.
 */
const batchColumns = () => {
  const columns = schema.migrationBatch;
  return {
    id: columns.id,
    organizationId: columns.organizationId,
    status: columns.status,
    sourceSystem: columns.sourceSystem,
    producer: columns.producer,
    connectorMaturity: columns.connectorMaturity,
    createdBy: columns.createdBy,
    counts: columns.counts,
    stageMapping: columns.stageMapping,
    excludedJobs: columns.excludedJobs,
    declarations: columns.declarations,
    packageKey: columns.packageKey,
    error: columns.error,
    createdAt: columns.createdAt,
    updatedAt: columns.updatedAt,
    committedAt: columns.committedAt,
    undoneAt: columns.undoneAt,
    purgedAt: columns.purgedAt,
  };
};

/** Credentials never outlive the batch's work: any change to an ended status wipes them in the same statement. */
const wipeWhenEnded = (status: MigrationStatus | undefined) => (status !== undefined && isMigrationEnded(status) ? { credentialsCiphertext: null } : {});

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleMigrationBatches(db: DbExecutor): MigrationBatchRepository {
  const { migrationBatch } = schema;
  const one = (organizationId: string, id: string) => and(eq(migrationBatch.organizationId, organizationId), eq(migrationBatch.id, id));
  return {
    async create(batch) {
      const [row] = await db.insert(migrationBatch).values({ ...batch, excludedJobs: [...batch.excludedJobs] }).returning(batchColumns());
      if (!row) throw new Error('migration_batch insert returned no row');
      return row;
    },
    async transition(organizationId, id, from, patch) {
      const [row] = await db
        .update(migrationBatch)
        .set({ ...patch, ...wipeWhenEnded(patch.status), excludedJobs: patch.excludedJobs === undefined ? undefined : [...patch.excludedJobs] })
        .where(and(one(organizationId, id), eq(migrationBatch.status, from)))
        .returning(batchColumns());
      if (!row) throw new ConflictError('migration_changed');
      return row;
    },
    async findById(organizationId, id) {
      const [row] = await db.select(batchColumns()).from(migrationBatch).where(one(organizationId, id)).limit(1);
      return row ?? null;
    },
    async lock(organizationId, id) {
      const [row] = await db.select(batchColumns()).from(migrationBatch).where(one(organizationId, id)).limit(1).for('update');
      return row ?? null;
    },
    async list(organizationId) {
      return db
        .select(batchColumns())
        .from(migrationBatch)
        .where(eq(migrationBatch.organizationId, organizationId))
        .orderBy(desc(migrationBatch.createdAt), desc(migrationBatch.id));
    },
    async listToPurge(before, limit) {
      return db
        .select(batchColumns())
        .from(migrationBatch)
        .where(and(inArray(migrationBatch.status, [...MIGRATION_ENDED_STATUSES]), lt(migrationBatch.updatedAt, before), isNull(migrationBatch.purgedAt)))
        .orderBy(asc(migrationBatch.updatedAt), asc(migrationBatch.id))
        .limit(limit);
    },
  };
}

const INSERT_CHUNK = 500;

export function createDrizzleMigrationIssues(db: DbExecutor): MigrationIssueRepository {
  const { migrationIssue } = schema;
  const inBatch = (organizationId: string, batchId: string) => and(eq(migrationIssue.organizationId, organizationId), eq(migrationIssue.batchId, batchId));
  const levelRank = sql`case ${migrationIssue.level} when 'error' then 0 when 'warning' then 1 else 2 end`;
  return {
    async replaceAll(organizationId, batchId, issues) {
      await db.delete(migrationIssue).where(inBatch(organizationId, batchId));
      // The batch and organization come from the call, never from the rows: an issue cannot be filed under another batch.
      const rows = issues.map((issue) => ({ ...issue, organizationId, batchId }));
      for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
        await db.insert(migrationIssue).values(rows.slice(start, start + INSERT_CHUNK));
      }
    },
    async list(query) {
      const where = and(inBatch(query.organizationId, query.batchId), query.level === undefined ? undefined : eq(migrationIssue.level, query.level));
      const rows = await db
        .select()
        .from(migrationIssue)
        .where(where)
        .orderBy(levelRank, asc(migrationIssue.code), asc(migrationIssue.ref), asc(migrationIssue.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit);
      const [totals] = await db.select({ total: sql<number>`count(*)::int` }).from(migrationIssue).where(where);
      return { items: rows.map(toIssue), total: totals?.total ?? 0 };
    },
    async deleteByBatch(organizationId, batchId) {
      await db.delete(migrationIssue).where(inBatch(organizationId, batchId));
    },
  };
}
