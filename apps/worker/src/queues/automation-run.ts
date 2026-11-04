import { OCCURRENCE_MAX, runAutomations, type Actor, type AutomationRunDeps } from '@candydati/core';
import { AUTOMATION_TRIGGERS } from '@candydati/domain';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const AUTOMATION_RUN_QUEUE = 'automation.run';

/** Ids and short keys only: a payload never carries personal data. Without a trigger it is a stage entry (older tasks). */
export const automationRunPayload = z.object({
  organizationId: z.string().min(1),
  applicationId: z.string().min(1),
  stageId: z.string().min(1),
  trigger: z.enum(AUTOMATION_TRIGGERS).optional(),
  occurrence: z.string().max(OCCURRENCE_MAX).optional(),
  ruleId: z.string().min(1).optional(),
});

const systemActorFor = (organizationId: string): Actor => ({
  type: 'system',
  id: 'automation-runner',
  onBehalfOfUserId: null,
  organizationId,
  role: 'recruiter',
});

/**
 * Runs the rules whose trigger fired for an application. The use case re-checks the application, isolates each rule
 * and reports failures as notifications, so a thrown error here is an infrastructure problem and pg-boss retries it.
 */
export const createAutomationRunQueue = (deps: AutomationRunDeps): QueueDefinition<typeof automationRunPayload> =>
  defineQueue({
    name: AUTOMATION_RUN_QUEUE,
    payload: automationRunPayload,
    handle: async ({ jobId, payload, logger }) => {
      const result = await runAutomations(deps, systemActorFor(payload.organizationId), payload);
      logger.info({ jobId, trigger: payload.trigger ?? 'stage_entered', ...result }, 'automations finished');
    },
  });
