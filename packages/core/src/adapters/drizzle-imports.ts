import { and, asc, desc, eq, inArray, isNull, lt, or, schema, sql } from '@tt/db';
import type { ImportAnalysis, ImportBatch, ImportItem } from '@tt/domain';
import type { ConsentTokenRepository, ImportAnalysisRepository, ImportBatchRepository, ImportItemRepository } from '../import-ports.js';
import { ConflictError } from '../errors.js';
import type { DbExecutor } from './db-executor.js';

type BatchRow = typeof schema.importBatch.$inferSelect;
type ItemRow = typeof schema.importItem.$inferSelect;

const toBatch = (row: BatchRow): ImportBatch => ({ ...row, mapping: row.mapping ?? null });

const toItem = (row: ItemRow): ImportItem => ({
  id: row.id,
  organizationId: row.organizationId,
  batchId: row.batchId,
  position: row.position,
  included: row.included,
  status: row.status,
  error: row.error,
  proposal: row.payload,
});

const toItemValues = (item: ImportItem) => ({
  id: item.id,
  organizationId: item.organizationId,
  batchId: item.batchId,
  position: item.position,
  included: item.included,
  status: item.status,
  error: item.error,
  confidence: item.proposal.confidence,
  payload: item.proposal,
});

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleImportBatches(db: DbExecutor): ImportBatchRepository {
  const { importBatch } = schema;
  return {
    async create(batch) {
      const [row] = await db.insert(importBatch).values(batch).returning();
      if (!row) throw new Error('import_batch insert returned no row');
      return toBatch(row);
    },
    async save(batch) {
      const { id, organizationId, ...values } = batch;
      const [row] = await db
        .update(importBatch)
        .set(values)
        .where(and(eq(importBatch.organizationId, organizationId), eq(importBatch.id, id)))
        .returning();
      if (!row) throw new Error('import_batch not found for save');
      return toBatch(row);
    },
    async transition(organizationId, id, from, patch) {
      const [row] = await db
        .update(importBatch)
        .set(patch)
        .where(and(eq(importBatch.organizationId, organizationId), eq(importBatch.id, id), eq(importBatch.status, from)))
        .returning();
      if (!row) throw new ConflictError('import_changed');
      return toBatch(row);
    },
    async addCounts(organizationId, id, delta) {
      const entries = Object.entries(delta).filter(([, value]) => value !== undefined && value !== 0);
      if (entries.length === 0) return;
      // One statement: each count is read and incremented under the row lock, so concurrent chunks never lose one.
      const increments = entries.map(([key, value]) => sql`jsonb_build_object(${key}::text, coalesce((${importBatch.counts} ->> ${key}::text)::int, 0) + ${value ?? 0}::int)`);
      const merged = increments.reduce((all, next) => sql`${all} || ${next}`, sql`${importBatch.counts}`);
      await db.update(importBatch).set({ counts: merged }).where(and(eq(importBatch.organizationId, organizationId), eq(importBatch.id, id)));
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(importBatch).where(and(eq(importBatch.organizationId, organizationId), eq(importBatch.id, id))).limit(1);
      return row ? toBatch(row) : null;
    },
    async lock(organizationId, id) {
      const [row] = await db
        .select()
        .from(importBatch)
        .where(and(eq(importBatch.organizationId, organizationId), eq(importBatch.id, id)))
        .limit(1)
        .for('update');
      return row ? toBatch(row) : null;
    },
    async list(organizationId) {
      const rows = await db.select().from(importBatch).where(eq(importBatch.organizationId, organizationId)).orderBy(desc(importBatch.createdAt), desc(importBatch.id));
      return rows.map(toBatch);
    },
    async listStale(before) {
      const rows = await db
        .select()
        .from(importBatch)
        .where(and(lt(importBatch.createdAt, before), or(inArray(importBatch.status, ['uploaded', 'analyzing', 'ready', 'importing']), sql`jsonb_array_length(${importBatch.sourceFiles}) > 0`)))
        .orderBy(asc(importBatch.createdAt), asc(importBatch.id));
      return rows.map(toBatch);
    },
  };
}

const INSERT_CHUNK = 200;

export function createDrizzleImportItems(db: DbExecutor): ImportItemRepository {
  const { importItem } = schema;
  const inBatch = (organizationId: string, batchId: string) => and(eq(importItem.organizationId, organizationId), eq(importItem.batchId, batchId));
  return {
    async replaceAll(organizationId, batchId, items) {
      await db.delete(importItem).where(inBatch(organizationId, batchId));
      for (let start = 0; start < items.length; start += INSERT_CHUNK) {
        await db.insert(importItem).values(items.slice(start, start + INSERT_CHUNK).map(toItemValues));
      }
    },
    async list(query) {
      const where = and(inBatch(query.organizationId, query.batchId), query.confidence === undefined ? undefined : eq(importItem.confidence, query.confidence));
      const rows = await db.select().from(importItem).where(where).orderBy(asc(importItem.position)).limit(query.limit).offset((query.page - 1) * query.limit);
      const [totals] = await db.select({ total: sql<number>`count(*)::int` }).from(importItem).where(where);
      return { items: rows.map(toItem), total: totals?.total ?? 0 };
    },
    async listAll(organizationId, batchId) {
      return (await db.select().from(importItem).where(inBatch(organizationId, batchId)).orderBy(asc(importItem.position))).map(toItem);
    },
    async setIncluded(organizationId, batchId, changes) {
      for (const included of [true, false]) {
        const ids = changes.filter((change) => change.included === included).map((change) => change.itemId);
        if (ids.length > 0) await db.update(importItem).set({ included }).where(and(inBatch(organizationId, batchId), inArray(importItem.id, ids)));
      }
    },
    async setStatus(organizationId, itemId, status, error) {
      const rows = await db
        .update(importItem)
        .set({ status, error })
        .where(and(eq(importItem.organizationId, organizationId), eq(importItem.id, itemId), eq(importItem.status, 'pending')))
        .returning({ id: importItem.id });
      return rows.length > 0;
    },
    async deleteByBatch(organizationId, batchId) {
      await db.delete(importItem).where(inBatch(organizationId, batchId));
    },
  };
}

export function createDrizzleImportAnalyses(db: DbExecutor): ImportAnalysisRepository {
  const { importAnalysis } = schema;
  return {
    async save(analysis) {
      const values = { batchId: analysis.batchId, organizationId: analysis.organizationId, data: { cvs: analysis.cvs, rows: analysis.rows } };
      await db.insert(importAnalysis).values(values).onConflictDoUpdate({ target: importAnalysis.batchId, set: { data: values.data } });
    },
    async find(organizationId, batchId) {
      const [row] = await db.select().from(importAnalysis).where(and(eq(importAnalysis.organizationId, organizationId), eq(importAnalysis.batchId, batchId))).limit(1);
      return row ? ({ batchId: row.batchId, organizationId: row.organizationId, ...row.data } satisfies ImportAnalysis) : null;
    },
    async delete(organizationId, batchId) {
      await db.delete(importAnalysis).where(and(eq(importAnalysis.organizationId, organizationId), eq(importAnalysis.batchId, batchId)));
    },
  };
}

export function createDrizzleConsentTokens(db: DbExecutor): ConsentTokenRepository {
  const { consentToken } = schema;
  return {
    async create(token) {
      const [row] = await db.insert(consentToken).values(token).returning();
      if (!row) throw new Error('consent_token insert returned no row');
      return row;
    },
    async findByHash(tokenHash) {
      const [row] = await db.select().from(consentToken).where(eq(consentToken.tokenHash, tokenHash)).limit(1);
      return row ?? null;
    },
    async markUsed(tokenHash, at) {
      const rows = await db
        .update(consentToken)
        .set({ usedAt: at })
        .where(and(eq(consentToken.tokenHash, tokenHash), isNull(consentToken.usedAt)))
        .returning({ tokenHash: consentToken.tokenHash });
      return rows.length > 0;
    },
  };
}
