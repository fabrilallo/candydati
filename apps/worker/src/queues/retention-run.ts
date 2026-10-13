import { runRetention, type RetentionDeps } from '@tt/core';
import { z } from 'zod';
import { sendDigests, type DigestSender } from '../deadlines/digest.js';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const RETENTION_RUN_QUEUE = 'retention.run';
/** Every day at 03:00 UTC. */
export const RETENTION_RUN_CRON = '0 3 * * *';

export interface RetentionRunDeps {
  readonly retention: RetentionDeps;
  readonly digest: DigestSender;
  readonly now: () => Date;
}

/**
 * Daily: warns owners and admins about applications expiring within 30 days (notification plus one digest email per
 * person), erases the ones past their expiry and deletes expired organization exports. Logs counts only.
 */
export const createRetentionRunQueue = ({ retention, digest, now }: RetentionRunDeps): QueueDefinition<z.ZodType> =>
  defineQueue({
    name: RETENTION_RUN_QUEUE,
    payload: z.unknown(),
    schedule: { cron: RETENTION_RUN_CRON, data: {} },
    handle: async ({ jobId, logger }) => {
      const result = await runRetention(retention, { now: now() });
      const mail = await sendDigests(digest, result.digests);
      const warned = result.runs.reduce((sum, run) => sum + run.warned, 0);
      const erased = result.runs.reduce((sum, run) => sum + run.erased, 0);
      logger.info({ jobId, warned, erased, exportsDeleted: result.exportsDeleted, digests: result.digests.length, ...mail }, 'retention run finished');
      if (result.failures.length > 0) {
        // Ids only. The failed candidates are retried by the next run.
        logger.error({ jobId, failures: result.failures.map(({ organizationId, candidateId }) => ({ organizationId, candidateId })) }, 'retention erasure failed for some candidates');
      }
    },
  });
