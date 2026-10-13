import type { ImportAnalysis, ImportCounts, ImportItemProposal, ImportItemStatus, ImportMapping, ImportSourceFile, ImportStatus } from '@tt/domain';
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { job } from './job.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/**
 * One import (PRODUCT.md §3.1): a folder of CVs and/or sheets turned into candidates of one job. The row stays after the
 * undo with counts only; the proposed people (`import_item`, `import_analysis`) are deleted when the batch is done or undone.
 */
export const importBatch = pgTable(
  'import_batch',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    jobId: text('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'restrict' }),
    stageId: text('stage_id').notNull(),
    status: text('status').$type<ImportStatus>().notNull(),
    /** Plain text with no foreign key: the batch survives the removal of the user who started it. */
    createdBy: text('created_by').notNull(),
    counts: jsonb('counts').$type<ImportCounts>().notNull(),
    mapping: jsonb('mapping').$type<ImportMapping>(),
    headers: jsonb('headers').$type<readonly string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Uploaded originals (names can contain personal data): cleared with the rest once the batch is done or undone. */
    sourceFiles: jsonb('source_files').$type<readonly ImportSourceFile[]>().notNull().default(sql`'[]'::jsonb`),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    importedAt: timestamp('imported_at', { withTimezone: true }),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
  },
  (table) => [index('import_batch_org_created_idx').on(table.organizationId, sql`${table.createdAt} desc`)],
);

/** A proposed person of a batch, with the user's include/exclude choice. Personal data: deleted when the batch ends. */
export const importItem = pgTable(
  'import_item',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    batchId: text('batch_id')
      .notNull()
      .references(() => importBatch.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    included: boolean('included').notNull(),
    status: text('status').$type<ImportItemStatus>().notNull().default('pending'),
    error: text('error'),
    confidence: text('confidence').$type<ImportItemProposal['confidence']>().notNull(),
    payload: jsonb('payload').$type<ImportItemProposal>().notNull(),
  },
  (table) => [uniqueIndex('import_item_batch_position_uidx').on(table.batchId, table.position), index('import_item_org_idx').on(table.organizationId)],
);

/** The parsed CVs and rows of a batch: what re-matching after a mapping change starts from. Deleted with the items. */
export const importAnalysis = pgTable('import_analysis', {
  batchId: text('batch_id')
    .primaryKey()
    .references(() => importBatch.id, { onDelete: 'restrict' }),
  organizationId: organizationRef(),
  data: jsonb('data').$type<Pick<ImportAnalysis, 'cvs' | 'rows'>>().notNull(),
});

export type ImportBatchRow = typeof importBatch.$inferSelect;
export type ImportItemRow = typeof importItem.$inferSelect;
export type ImportAnalysisRow = typeof importAnalysis.$inferSelect;
