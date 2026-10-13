import { scanDeadlines, type ScanDeps } from '@tt/core';
import { z } from 'zod';
import { sendDigests, type DigestSender } from '../deadlines/digest.js';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const DEADLINES_SCAN_QUEUE = 'deadlines.scan';
export const DEADLINES_SCAN_CRON = '0 * * * *';

export interface DeadlineScanDeps {
  readonly scan: ScanDeps;
  readonly digest: DigestSender;
  readonly now: () => Date;
}

/** Hourly: notifies about applications due soon or overdue and tasks due, then emails each person one digest. */
export const createDeadlinesScanQueue = ({ scan, digest, now }: DeadlineScanDeps): QueueDefinition<z.ZodType> =>
  defineQueue({
    name: DEADLINES_SCAN_QUEUE,
    payload: z.unknown(),
    schedule: { cron: DEADLINES_SCAN_CRON, data: {} },
    handle: async ({ jobId, logger }) => {
      const { digests } = await scanDeadlines(scan, { now: now() });
      const result = await sendDigests(digest, digests);
      logger.info({ jobId, digests: digests.length, ...result }, 'deadline scan finished');
    },
  });
