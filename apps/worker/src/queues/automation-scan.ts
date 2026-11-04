import { expireMoveProposals, scanTimedAutomations, type AutomationScanDeps } from '@candydati/core';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const AUTOMATION_SCAN_QUEUE = 'automation.scan';
/** Hourly, at a quarter past: away from the deadline scan on the hour. */
export const AUTOMATION_SCAN_CRON = '15 * * * *';

/**
 * Hourly: queues `automation.run` for the time-based rules (stuck in a stage, response deadline near) that are due
 * (`scanTimedAutomations`), and closes the move proposals past their expiry. Idempotent: what already ran is not queued
 * again. Logs counts only.
 */
export const createAutomationScanQueue = (deps: AutomationScanDeps, now: () => Date): QueueDefinition<z.ZodType> =>
  defineQueue({
    name: AUTOMATION_SCAN_QUEUE,
    payload: z.unknown(),
    schedule: { cron: AUTOMATION_SCAN_CRON, data: {} },
    handle: async ({ jobId, logger }) => {
      const at = now();
      const result = await scanTimedAutomations(deps, { now: at });
      const proposals = await expireMoveProposals(deps, { now: at });
      logger.info({ jobId, ...result, expiredProposals: proposals.expired }, 'automation scan finished');
    },
  });
