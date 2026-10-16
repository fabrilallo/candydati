import { careersPageDocumentSchema, MEDIA_KINDS, optionalLocalizedSchema, type CareersPageDocument } from '@candydati/domain';
import { and, count, desc, eq, inArray, schema, sql } from '@candydati/db';
import { z } from 'zod';
import type { CareersMediaRecord, CareersMediaRepository, CareersPageRecord, CareersPageRepository } from '../careers-ports.js';
import type { DbExecutor } from './db-executor.js';

type PageRow = typeof schema.careersPage.$inferSelect;
type MediaRow = typeof schema.careersMedia.$inferSelect;

/** jsonb is a boundary: a stored document that no longer validates is corrupted data, and fails loudly. */
const parseDocument = (value: unknown): CareersPageDocument => careersPageDocumentSchema.parse(value);

const toPage = (row: PageRow): CareersPageRecord => ({
  organizationId: row.organizationId,
  draft: parseDocument(row.draft),
  published: row.published === null ? null : parseDocument(row.published),
  revision: row.revision,
  draftUpdatedAt: row.draftUpdatedAt,
  publishedAt: row.publishedAt,
});

type PageChange = Partial<Pick<PageRow, 'published' | 'publishedAt' | 'publishedBy'>> & Pick<PageRow, 'draft' | 'draftUpdatedAt' | 'draftUpdatedBy'>;

export function createDrizzleCareersPages(db: DbExecutor): CareersPageRepository {
  const table = schema.careersPage;
  /**
   * Optimistic lock in one statement each: an update guarded by the expected revision, or (for a page never saved) an
   * insert that loses to a concurrent one. Null when neither wrote: the caller's revision is stale.
   */
  const write = async (organizationId: string, change: PageChange, expectedRevision: number): Promise<CareersPageRecord | null> => {
    const [updated] = await db
      .update(table)
      .set({ ...change, revision: sql`${table.revision} + 1` })
      .where(and(eq(table.organizationId, organizationId), eq(table.revision, expectedRevision)))
      .returning();
    if (updated) return toPage(updated);
    if (expectedRevision !== 0) return null;
    const [inserted] = await db.insert(table).values({ organizationId, ...change, revision: 1 }).onConflictDoNothing({ target: table.organizationId }).returning();
    return inserted ? toPage(inserted) : null;
  };
  return {
    async find(organizationId) {
      const [row] = await db.select().from(table).where(eq(table.organizationId, organizationId)).limit(1);
      return row ? toPage(row) : null;
    },
    async saveDraft(organizationId, draft, at, userId, expectedRevision) {
      return write(organizationId, { draft: parseDocument(draft), draftUpdatedAt: at, draftUpdatedBy: userId }, expectedRevision);
    },
    async publish(organizationId, document, at, userId, expectedRevision) {
      const valid = parseDocument(document);
      return write(organizationId, { draft: valid, published: valid, draftUpdatedAt: at, draftUpdatedBy: userId, publishedAt: at, publishedBy: userId }, expectedRevision);
    },
  };
}

const widthsSchema = z.array(z.number().int().positive());
const altSchema = optionalLocalizedSchema(1000);
const kindSchema = z.enum(MEDIA_KINDS);

const toMedia = (row: MediaRow): CareersMediaRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  kind: kindSchema.parse(row.kind),
  mime: row.mime,
  sizeBytes: row.sizeBytes,
  width: row.width,
  height: row.height,
  sha256: row.sha256,
  widths: widthsSchema.parse(row.widths),
  alt: altSchema.parse(row.alt),
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

export function createDrizzleCareersMedia(db: DbExecutor): CareersMediaRepository {
  const table = schema.careersMedia;
  const inOrganization = (organizationId: string) => eq(table.organizationId, organizationId);
  return {
    async insert(record) {
      const [row] = await db
        .insert(table)
        .values({ ...record, widths: [...record.widths], alt: { ...record.alt } })
        .returning();
      if (!row) throw new Error('careers_media insert returned no row');
      return toMedia(row);
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(table).where(and(inOrganization(organizationId), eq(table.id, id))).limit(1);
      return row ? toMedia(row) : null;
    },
    async findByIds(organizationId, ids) {
      if (ids.length === 0) return [];
      const rows = await db.select().from(table).where(and(inOrganization(organizationId), inArray(table.id, [...ids])));
      return rows.map(toMedia);
    },
    async list(organizationId, limit) {
      const rows = await db.select().from(table).where(inOrganization(organizationId)).orderBy(desc(table.createdAt), desc(table.id)).limit(limit);
      return rows.map(toMedia);
    },
    async count(organizationId) {
      const [row] = await db.select({ value: count() }).from(table).where(inOrganization(organizationId));
      return Number(row?.value ?? 0);
    },
    async delete(organizationId, id) {
      const rows = await db.delete(table).where(and(inOrganization(organizationId), eq(table.id, id))).returning({ id: table.id });
      return rows.length > 0;
    },
  };
}
