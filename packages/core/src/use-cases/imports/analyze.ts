import {
  autoMapColumns,
  importFilePrefix,
  importMappingSchema,
  parsedImportCvSchema,
  parsedImportRowSchema,
  IMPORT_LIMITS,
  type ImportBatch,
} from '@tt/domain';
import { z } from 'zod';
import type { ImportDeps } from '../../import-ports.js';
import { ValidationError } from '../../errors.js';
import { defineSystemJob } from '../../use-case.js';
import { assertStatus, countOf, requireBatch, withCounts } from './shared.js';
import { proposeItems } from './matching.js';

/** CV text kept for search and for the stored extraction. */
export const IMPORT_CV_TEXT_MAX = 50_000;

type AnalysisDeps = Pick<ImportDeps, 'imports' | 'importItems' | 'importAnalyses' | 'candidates' | 'files' | 'queue' | 'newId' | 'now'>;

const batchRef = z.object({ organizationId: z.string().min(1), batchId: z.string().min(1) });

/** Worker, start of `import.analyze`: the batch goes to `analyzing` (a retry finds it there) and the worker reads its sources. */
export const startImportAnalysis = defineSystemJob<AnalysisDeps, typeof batchRef, ImportBatch>({
  name: 'startImportAnalysis',
  input: batchRef,
  handler: async ({ deps, input }) => {
    const batch = await requireBatch(deps, input.organizationId, input.batchId);
    assertStatus(batch, ['uploaded', 'analyzing']);
    return batch.status === 'analyzing' ? batch : deps.imports.save({ ...batch, status: 'analyzing' });
  },
});

const analysisInput = batchRef.extend({
  /** Column headers of the sheet(s), in order. */
  headers: z.array(z.string().max(300)).max(500).default([]),
  cvs: z.array(parsedImportCvSchema).max(IMPORT_LIMITS.maxFiles),
  rows: z.array(parsedImportRowSchema).max(IMPORT_LIMITS.maxRows),
  /** Absent: proposed from the headers. */
  mapping: importMappingSchema.optional(),
});

/**
 * Worker, end of `import.analyze`: stores the parsed CVs and rows, proposes the mapping, runs the matching and leaves the
 * batch `ready` for the preview. CV keys must be under the batch prefix: a worker cannot be made to copy someone else's file.
 */
export const recordImportAnalysis = defineSystemJob<AnalysisDeps, typeof analysisInput, ImportBatch>({
  name: 'recordImportAnalysis',
  input: analysisInput,
  handler: async ({ deps, input }) => {
    const batch = await requireBatch(deps, input.organizationId, input.batchId);
    assertStatus(batch, ['uploaded', 'analyzing']);
    const prefix = importFilePrefix(batch.organizationId, batch.id);
    const foreign = input.cvs.filter((cv) => !cv.key.startsWith(prefix));
    if (foreign.length > 0) throw new ValidationError([{ path: 'cvs', message: 'key_outside_batch' }]);
    const cvs = input.cvs.map((cv) => ({ ...cv, text: cv.text.slice(0, IMPORT_CV_TEXT_MAX) }));
    const mapping = input.mapping ?? autoMapColumns(input.headers);
    const analysis = { batchId: batch.id, organizationId: batch.organizationId, cvs, rows: input.rows };
    const items = await proposeItems(deps, batch, analysis, mapping);
    await deps.importAnalyses.save(analysis);
    await deps.importItems.replaceAll(batch.organizationId, batch.id, items);
    return deps.imports.save({
      ...withCounts(batch, { cvs: cvs.length, rows: input.rows.length, ...countOf(items) }),
      status: 'ready',
      mapping,
      headers: input.headers,
      error: null,
    });
  },
});

const failureInput = batchRef.extend({ reason: z.string().trim().min(1).max(300) });

/** Worker: parsing failed for good (unreadable archive, limits exceeded). The reason is shown to the user. */
export const failImportBatch = defineSystemJob<Pick<ImportDeps, 'imports' | 'files' | 'queue'>, typeof failureInput, ImportBatch>({
  name: 'failImportBatch',
  input: failureInput,
  handler: async ({ deps, input }) => {
    const batch = await requireBatch(deps, input.organizationId, input.batchId);
    assertStatus(batch, ['uploaded', 'analyzing', 'importing']);
    return deps.imports.save({ ...batch, status: 'failed', error: input.reason });
  },
});
