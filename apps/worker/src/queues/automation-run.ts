import { runAutomations, type Actor, type AutomationRunDeps } from '@tt/core';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const AUTOMATION_RUN_QUEUE = 'automation.run';

/** Ids only: a payload never carries personal data. */
export const automationRunPayload = z.object({
  organizationId: z.string().min(1),
  applicationId: z.string().min(1),
  stageId: z.string().min(1),
});

const systemActorFor = (organizationId: string): Actor => ({
  type: 'system',
  id: 'automation-runner',
  onBehalfOfUserId: null,
  organizationId,
  role: 'recruiter',
});

/**
 * Runs the rules of the stage an application just entered. The use case re-checks the application, isolates each rule
 * and reports failures as notifications, so a thrown error here is an infrastructure problem and pg-boss retries it.
 */
export const createAutomationRunQueue = (deps: AutomationRunDeps): QueueDefinition<typeof automationRunPayload> =>
  defineQueue({
    name: AUTOMATION_RUN_QUEUE,
    payload: automationRunPayload,
    handle: async ({ jobId, payload, logger }) => {
      const result = await runAutomations(deps, systemActorFor(payload.organizationId), payload);
      logger.info({ jobId, ...result }, 'automations finished');
    },
  });
