import { runImportAnalysis, type ImportAnalysisDeps, type CvExtractor, DEFAULT_ANALYSIS_BUDGET_MS, DEFAULT_ANALYSIS_CONCURRENCY } from '@tt/providers';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const IMPORT_ANALYZE_QUEUE = 'import.analyze';

/** Ids only: a payload never carries personal data. */
export const importPayload = z.object({ organizationId: z.string().min(1), batchId: z.string().min(1) });

export interface ImportAnalyzeDeps {
  readonly deps: ImportAnalysisDeps;
  /** Absent when no model is configured. */
  readonly extractor: CvExtractor | null;
  readonly concurrency?: number;
  readonly budgetMs?: number;
}

/**
 * Reads the uploaded originals and leaves the batch `ready` for the preview. Refused files fail the batch with a reason
 * code; anything unexpected is retried and fails the batch on the last attempt. Logs ids and counts only.
 */
export const createImportAnalyzeQueue = ({ deps, extractor, concurrency = DEFAULT_ANALYSIS_CONCURRENCY, budgetMs = DEFAULT_ANALYSIS_BUDGET_MS }: ImportAnalyzeDeps): QueueDefinition<typeof importPayload> =>
  defineQueue({
    name: IMPORT_ANALYZE_QUEUE,
    payload: importPayload,
    handle: async ({ jobId, payload, logger, lastAttempt }) => {
      const outcome = await runImportAnalysis(deps, payload, { extractor, concurrency, budgetMs, lastAttempt });
      logger.info({ jobId, batchId: payload.batchId, outcome }, 'import analysis finished');
    },
  });
