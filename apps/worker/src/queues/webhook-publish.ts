import { publishWebhookEvents, type WebhookPublishDeps } from '@tt/core';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const WEBHOOK_PUBLISH_QUEUE = 'webhooks.publish';
export const WEBHOOK_PUBLISH_CRON = '* * * * *';

/** Fans the outbox out to `webhook.deliver` tasks every minute. Delivery is at-least-once. */
export const createWebhookPublishQueue = (deps: WebhookPublishDeps): QueueDefinition<z.ZodType> =>
  defineQueue({
    name: WEBHOOK_PUBLISH_QUEUE,
    payload: z.unknown(),
    schedule: { cron: WEBHOOK_PUBLISH_CRON, data: {} },
    handle: async ({ jobId, logger }) => {
      const result = await publishWebhookEvents(deps, {});
      if (result.published > 0 || result.pending > 0) logger.info({ jobId, ...result }, 'webhook events published');
    },
  });
