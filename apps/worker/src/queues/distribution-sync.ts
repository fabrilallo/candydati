import { runDistributionSync, type Actor, type DistributionDeps } from '@tt/core';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const DISTRIBUTION_SYNC_QUEUE = 'distribution.sync';

/** Ids only: the job is read again when the task runs. */
export const distributionSyncPayload = z.object({ organizationId: z.string().min(1), jobId: z.string().min(1) });

const systemActorFor = (organizationId: string): Actor => ({
  type: 'system',
  id: 'distribution-sync',
  onBehalfOfUserId: null,
  organizationId,
  role: 'recruiter',
});

/**
 * Syncs every registered distribution channel of a job after `job.published`, `job.updated` or `job.closed`. A channel that
 * fails is recorded (`failed`, with its reason) by the use case; here the task is rethrown while retries remain so
 * pg-boss tries again with backoff, and on the last attempt the `failed` status simply stays. With the empty registry of
 * the open source distribution this does nothing and records nothing.
 */
export const createDistributionSyncQueue = (deps: DistributionDeps): QueueDefinition<typeof distributionSyncPayload> =>
  defineQueue({
    name: DISTRIBUTION_SYNC_QUEUE,
    payload: distributionSyncPayload,
    handle: async ({ jobId, payload, logger, lastAttempt, attempt }) => {
      const result = await runDistributionSync(deps, systemActorFor(payload.organizationId), payload);
      if (result.failed > 0 && !lastAttempt) throw new Error(`distribution_failed:${result.failed}`);
      if (result.failed > 0) logger.error({ jobId, ...result, attempt }, 'distribution failed, giving up');
      else if (result.published + result.removed > 0) logger.info({ jobId, ...result }, 'distribution synced');
    },
  });
