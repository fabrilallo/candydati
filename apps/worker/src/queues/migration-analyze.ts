import { analyzeMigration, type MigrationAnalysisDeps } from '@candydati/core';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const MIGRATION_ANALYZE_QUEUE = 'migration.analyze';

/** Ids only: a payload never carries personal data. */
export const migrationPayload = z.object({ organizationId: z.string().min(1), batchId: z.string().min(1) });

/**
 * Opens and checks an uploaded migration package and leaves its batch `ready` for the preview (ADR 0009). A refused
 * package fails the batch with a reason code; anything unexpected is retried and fails the batch on the last attempt.
 * Logs ids and the outcome only.
 */
export const createMigrationAnalyzeQueue = (deps: MigrationAnalysisDeps): QueueDefinition<typeof migrationPayload> =>
  defineQueue({
    name: MIGRATION_ANALYZE_QUEUE,
    payload: migrationPayload,
    handle: async ({ jobId, payload, logger, lastAttempt }) => {
      const outcome = await analyzeMigration(deps, { ...payload, lastAttempt });
      logger.info({ jobId, batchId: payload.batchId, outcome }, 'migration analysis finished');
    },
  });
