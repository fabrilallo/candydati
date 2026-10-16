import { IMPORT_CONFIDENCES, importMappingSchema, importItemSelectionSchema, unknownMappingHeaders, IMPORT_ITEMS_PAGE_MAX, IMPORT_LIMITS, pipelineStagesOf, type ImportBatch } from '@candydati/domain';
import { z } from 'zod';
import { ConflictError, NotFoundError, ValidationError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import { defineImportUseCase } from './define.js';
import { proposeItems } from './matching.js';
import { assertStatus, countOf, DEFAULT_ITEMS_LIMIT, loadBatchPage, requireBatch, withCounts } from './shared.js';
import type { ImportBatchView } from './views.js';

const pageInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(IMPORT_ITEMS_PAGE_MAX).default(DEFAULT_ITEMS_LIMIT),
  confidence: z.enum(IMPORT_CONFIDENCES).optional(),
});

export const listImports = defineImportUseCase({
  name: 'listImports',
  input: z.object({}),
  permission: 'import:manage',
  audit: { skip: 'listing of batches: counts only' },
  handler: async ({ deps, actor }): Promise<readonly ImportBatch[]> => deps.imports.list(actor.organizationId),
});

/** The batch and one page of its proposed people (confidence, conflicts, missing data). Listing: not audited. */
export const getImportBatch = defineImportUseCase({
  name: 'getImportBatch',
  input: pageInput.extend({ batchId: z.string().min(1) }),
  permission: 'import:manage',
  audit: { skip: 'preview listing: the personal data is written, and audited, only by the commit' },
  handler: async ({ deps, actor, input }): Promise<ImportBatchView> =>
    loadBatchPage(deps, await requireBatch(deps, actor.organizationId, input.batchId), input.page, input.limit, input.confidence),
});

/**
 * Changes the column mapping and runs the matching again over the stored CVs and rows. Include/exclude choices made
 * before are lost: the mapping decides who the people are.
 */
export const updateImportMapping = defineImportUseCase({
  name: 'updateImportMapping',
  input: z.object({ batchId: z.string().min(1), mapping: importMappingSchema }),
  permission: 'import:manage',
  audit: { skip: 'preview: nothing is written about candidates until the commit' },
  handler: async ({ deps, actor, input }): Promise<ImportBatchView> => {
    const batch = await requireBatch(deps, actor.organizationId, input.batchId);
    assertStatus(batch, ['ready']);
    const unknown = unknownMappingHeaders(input.mapping, batch.headers);
    if (unknown.length > 0) throw new ValidationError([{ path: 'mapping', message: `unknown_column: ${unknown.join(', ')}` }]);
    const analysis = await deps.importAnalyses.find(batch.organizationId, batch.id);
    if (!analysis) throw new NotFoundError('Import data not found.');
    const items = await proposeItems(deps, batch, analysis, input.mapping);
    await deps.importItems.replaceAll(batch.organizationId, batch.id, items);
    const saved = await deps.imports.save({ ...withCounts(batch, countOf(items)), mapping: input.mapping });
    return loadBatchPage(deps, saved, 1, DEFAULT_ITEMS_LIMIT);
  },
});

/**
 * Include or exclude people, and optionally pick another target job and stage (both together). A person without a CV
 * cannot be included: an application always carries the original document.
 */
export const setImportItems = defineImportUseCase({
  name: 'setImportItems',
  input: z.object({
    batchId: z.string().min(1),
    items: z.array(importItemSelectionSchema).max(IMPORT_LIMITS.maxRows).default([]),
    target: z.object({ jobId: z.string().min(1), stageId: z.string().min(1) }).optional(),
  }),
  permission: 'import:manage',
  audit: { skip: 'preview: nothing is written about candidates until the commit' },
  handler: async ({ deps, actor, input }): Promise<ImportBatchView> => {
    const batch = await requireBatch(deps, actor.organizationId, input.batchId);
    assertStatus(batch, ['ready']);
    const all = await deps.importItems.listAll(batch.organizationId, batch.id);
    const withoutCv = new Set(all.filter((item) => item.proposal.cv === null).map((item) => item.id));
    if (input.items.some((change) => change.included && withoutCv.has(change.itemId))) {
      throw new ValidationError([{ path: 'items', message: 'cv_required' }]);
    }
    let next = batch;
    if (input.target) {
      const job = await requireJob(deps, batch.organizationId, input.target.jobId);
      if (job.status === 'closed') throw new ConflictError('job_closed');
      if (!pipelineStagesOf(job.content.process).some((stage) => stage.id === input.target?.stageId)) {
        throw new ValidationError([{ path: 'target.stageId', message: 'unknown_stage' }]);
      }
      next = { ...batch, jobId: job.id, stageId: input.target.stageId };
    }
    await deps.importItems.setIncluded(batch.organizationId, batch.id, input.items);
    const updated = await deps.importItems.listAll(batch.organizationId, batch.id);
    const saved = await deps.imports.save({ ...withCounts(next, countOf(updated)) });
    return loadBatchPage(deps, saved, 1, DEFAULT_ITEMS_LIMIT);
  },
});
