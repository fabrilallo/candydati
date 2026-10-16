import { runRetentionJob, type RetentionJobDeps } from '@candydati/core';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const RETENTION_RUN_QUEUE = 'retention.run';
/** Every day at 03:00 UTC. */
export const RETENTION_RUN_CRON = '0 3 * * *';

export interface RetentionRunDeps extends RetentionJobDeps {
  readonly now: () => Date;
}

/** Daily: retention warnings and erasure, expired exports, stale imports, delivery-log pruning (`runRetentionJob`). Logs counts and ids only. */
export const createRetentionRunQueue = ({ now, ...deps }: RetentionRunDeps): QueueDefinition<z.ZodType> =>
  defineQueue({
    name: RETENTION_RUN_QUEUE,
    payload: z.unknown(),
    schedule: { cron: RETENTION_RUN_CRON, data: {} },
    handle: async ({ jobId, logger }) => {
      const { staleImportFailures, erasureFailures, orphanedFiles, ...counts } = await runRetentionJob(deps, now());
      logger.info({ jobId, ...counts }, 'retention run finished');
      if (staleImportFailures.length > 0) logger.error({ jobId, failures: staleImportFailures }, 'stale import purge failed for some batches');
      if (orphanedFiles.length > 0) logger.error({ jobId, orphanedFiles }, 'erased candidates left stored files that could be neither deleted nor queued');
      // Ids only. The failed candidates are retried by the next run.
      if (erasureFailures.length > 0) logger.error({ jobId, failures: erasureFailures }, 'retention erasure failed for some candidates');
    },
  });
