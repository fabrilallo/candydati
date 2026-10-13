import { scanDeadlines, scanFeedbackReminders, scanStaleJobs, type FeedbackStageEntryDeps, type ScanDeps, type StaleScanDeps } from '@tt/core';
import { z } from 'zod';
import { mergeDigests, sendDigests, type DigestSender } from '../deadlines/digest.js';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const DEADLINES_SCAN_QUEUE = 'deadlines.scan';
export const DEADLINES_SCAN_CRON = '0 * * * *';

export interface DeadlineScanDeps {
  readonly scan: ScanDeps;
  /** Reminders for interview feedback still empty after 2 and 5 days. */
  readonly feedback?: FeedbackStageEntryDeps;
  /** Published ads idle for 90 days. */
  readonly stale?: StaleScanDeps;
  readonly digest: DigestSender;
  readonly now: () => Date;
}

/**
 * Hourly: notifies about applications due soon or overdue and tasks due, reminds interviewers who have not left
 * feedback, flags ads idle for 90 days (never closing them), then emails each person one digest.
 */
export const createDeadlinesScanQueue = ({ scan, feedback, stale, digest, now }: DeadlineScanDeps): QueueDefinition<z.ZodType> =>
  defineQueue({
    name: DEADLINES_SCAN_QUEUE,
    payload: z.unknown(),
    schedule: { cron: DEADLINES_SCAN_CRON, data: {} },
    handle: async ({ jobId, logger }) => {
      const at = now();
      const deadlines = await scanDeadlines(scan, { now: at });
      const reminders = feedback ? await scanFeedbackReminders(feedback, { now: at }) : { reminded: 0, failed: 0 };
      const staleResult = stale ? await scanStaleJobs(stale, { now: at }) : { digests: [] };
      const digests = mergeDigests(deadlines.digests, staleResult.digests);
      const result = await sendDigests(digest, digests);
      logger.info({ jobId, digests: digests.length, feedbackReminded: reminders.reminded, feedbackFailed: reminders.failed, ...result }, 'deadline scan finished');
    },
  });
