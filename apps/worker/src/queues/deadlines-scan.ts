import { runDeadlineScan, type DeadlineScanJobDeps } from '@candydati/core';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const DEADLINES_SCAN_QUEUE = 'deadlines.scan';
export const DEADLINES_SCAN_CRON = '0 * * * *';

export interface DeadlineScanDeps extends DeadlineScanJobDeps {
  readonly now: () => Date;
}

/** Hourly: the deadline, feedback and stale-ad scans and the digest emails (`runDeadlineScan`). Logs counts only. */
export const createDeadlinesScanQueue = ({ now, ...deps }: DeadlineScanDeps): QueueDefinition<z.ZodType> =>
  defineQueue({
    name: DEADLINES_SCAN_QUEUE,
    payload: z.unknown(),
    schedule: { cron: DEADLINES_SCAN_CRON, data: {} },
    handle: async ({ jobId, logger }) => {
      const result = await runDeadlineScan(deps, now());
      logger.info({ jobId, ...result }, 'deadline scan finished');
    },
  });
