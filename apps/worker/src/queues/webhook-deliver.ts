import { deliverWebhook, type Actor, type WebhookDeliverDeps } from '@tt/core';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const WEBHOOK_DELIVER_QUEUE = 'webhook.deliver';

export const webhookDeliverPayload = z.object({
  organizationId: z.string().min(1),
  eventId: z.string().min(1),
  endpointId: z.string().min(1),
});

const systemActorFor = (organizationId: string): Actor => ({
  type: 'system',
  id: 'webhook-deliverer',
  onBehalfOfUserId: null,
  organizationId,
  role: 'recruiter',
});

/**
 * One delivery attempt. While retries remain a failed attempt is rethrown (`WebhookDeliveryError`) so pg-boss retries
 * it with backoff; the attempt number is the retry count plus one. Nothing about the URL or the body is logged.
 */
export const createWebhookDeliverQueue = (deps: WebhookDeliverDeps): QueueDefinition<typeof webhookDeliverPayload> =>
  defineQueue({
    name: WEBHOOK_DELIVER_QUEUE,
    payload: webhookDeliverPayload,
    handle: async ({ jobId, payload, logger, lastAttempt, attempt }) => {
      const result = await deliverWebhook(deps, systemActorFor(payload.organizationId), { ...payload, attempt, lastAttempt });
      logger.info({ jobId, endpointId: payload.endpointId, attempt, result }, 'webhook delivery finished');
    },
  });
