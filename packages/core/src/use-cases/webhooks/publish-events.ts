import { z } from 'zod';
import { defineSystemJob } from '../../use-case.js';
import type { WebhookPublishDeps } from '../../webhook-ports.js';

export interface PublishResult {
  /** Events fully fanned out and marked published. */
  readonly published: number;
  /** `webhook.deliver` tasks enqueued. */
  readonly enqueued: number;
  /** Events left unpublished because a delivery could not be enqueued; the next run tries them again. */
  readonly pending: number;
}

export const OUTBOX_BATCH = 100;

/**
 * System job: fans the outbox out. For each unpublished event, one `webhook.deliver` task per enabled endpoint of the
 * event's organization that subscribes to its type, then the event is marked published. If an enqueue fails the event
 * stays unpublished and is retried; delivery is at-least-once, so consumers dedupe on the payload `id`.
 */
export const publishWebhookEvents = defineSystemJob<WebhookPublishDeps, z.ZodObject<{ limit: z.ZodDefault<z.ZodNumber> }>, PublishResult>({
  name: 'publishWebhookEvents',
  input: z.object({ limit: z.number().int().min(1).max(1000).default(OUTBOX_BATCH) }),
  handler: async ({ deps, input }): Promise<PublishResult> => {
    const events = await deps.outbox.listUnpublished(input.limit);
    let published = 0;
    let enqueued = 0;
    for (const event of events) {
      if (event.type === 'ping') continue;
      const endpoints = await deps.endpoints.listForEvent(event.organizationId, event.type);
      try {
        for (const endpoint of endpoints) {
          await deps.queue.enqueue('webhook.deliver', { organizationId: event.organizationId, eventId: event.id, endpointId: endpoint.id });
          enqueued += 1;
        }
        await deps.outbox.markPublished(event.organizationId, event.id, deps.now());
        published += 1;
      } catch {
        // Left unpublished on purpose: the next run fans it out again.
      }
    }
    return { published, enqueued, pending: events.length - published };
  },
});
