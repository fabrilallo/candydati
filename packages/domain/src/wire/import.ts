import { z } from 'zod';
import { IMPORT_CONFIDENCES, IMPORT_FLAGS, IMPORT_ITEM_STATUSES, IMPORT_STATUSES } from '../import/import.js';
import { importMappingSchema } from '../import/mapping.js';
import { isoDate } from './common.js';

const count = z.number().int().nonnegative();

/** `ImportCounts` of the domain. */
export const importCountsSchema = z.object({
  files: count,
  cvs: count,
  rows: count,
  items: count,
  included: count,
  imported: count,
  merged: count,
  failed: count,
  noEmail: count,
  emailsQueued: count,
  skippedReconfirmed: count,
  erased: count,
});

/** Up to three values per column (preview only). */
export const columnSamplesSchema = z.record(z.string(), z.array(z.string()).max(3));

/**
 * The batch as the api sends it: `ImportBatchDto` of `@candydati/core` plus what the api route adds (`toBatchViews`): the job
 * (null when it is gone), the author by name, and the column samples on the preview page only.
 */
export const importBatchSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  stageId: z.string(),
  status: z.enum(IMPORT_STATUSES),
  counts: importCountsSchema,
  mapping: importMappingSchema.nullable(),
  headers: z.array(z.string()),
  error: z.string().nullable(),
  createdAt: isoDate,
  importedAt: isoDate.nullable(),
  undoneAt: isoDate.nullable(),
  job: z.object({ id: z.string(), title: z.string() }).nullable(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  columnSamples: columnSamplesSchema.optional(),
});
export type ImportBatchDto = z.infer<typeof importBatchSchema>;

/** `POST /imports` (201): the id and status of the new batch. */
export const importBatchRefSchema = z.object({ id: z.string(), status: z.enum(IMPORT_STATUSES) });
export type ImportBatchRefDto = z.infer<typeof importBatchRefSchema>;

const proposedCandidateSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  tags: z.array(z.string()),
  note: z.string().nullable(),
});

export const importConflictSchema = z.object({
  field: z.enum(['email', 'phone', 'name', 'linkedinUrl']),
  kind: z.enum(['sources', 'existing']),
  kept: z.string(),
  other: z.string(),
});

/** `ImportItemDto`: the proposal is spread on the item, `candidate`, `cv` and `sources` stay nested. */
export const importItemSchema = z.object({
  id: z.string(),
  position: count,
  included: z.boolean(),
  status: z.enum(IMPORT_ITEM_STATUSES),
  error: z.string().nullable(),
  confidence: z.enum(IMPORT_CONFIDENCES),
  basis: z.enum(['email', 'file_name', 'name', 'fuzzy_name', 'single']),
  candidate: proposedCandidateSchema,
  cv: z.object({ fileName: z.string(), key: z.string() }).nullable(),
  headline: z.string().nullable(),
  /** Rows are counted from 0 over the data rows of the sheet. */
  sources: z.object({ rows: z.array(count), files: z.array(z.string()) }),
  existing: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }).nullable(),
  conflicts: z.array(importConflictSchema),
  flags: z.array(z.enum(IMPORT_FLAGS)),
});
export type ImportItemDto = z.infer<typeof importItemSchema>;

/** `GET /imports/:id` and the answers of `PUT .../mapping` and `PUT .../items`: the batch with one page of items. */
export const importBatchPageSchema = z.object({
  batch: importBatchSchema,
  items: z.array(importItemSchema),
  total: count,
  page: count,
  limit: count,
});
export type ImportBatchPageDto = z.infer<typeof importBatchPageSchema>;

/** `POST /imports/:id/undo`: the batch (with job and author) and what the undo did. */
export const undoImportSchema = z.object({ batch: importBatchSchema, erased: count, skippedReconfirmed: count, failed: count });
export type UndoImportDto = z.infer<typeof undoImportSchema>;
