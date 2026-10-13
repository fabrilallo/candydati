import { z } from 'zod';
import { baseDeps, inTransaction } from '../../transaction.js';
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

/** Events that change what an ad looks like in the channels: they also queue a distribution sync of that job. */
const DISTRIBUTION_EVENTS: ReadonlySet<string> = new Set(['job.published', 'job.updated', 'job.closed']);

/**
 * System job: fans the outbox out. In one transaction it claims a batch of unpublished events (`SKIP LOCKED`: a second
 * publisher takes other events), queues one `webhook.deliver` task per enabled endpoint of the event's organization that
 * subscribes to its type, plus one `distribution.sync` for job events, then marks the event published. Every delivery
 * task has the singleton key `event:endpoint`, so an event fanned out again (an enqueue failed, the transaction rolled
 * back) never delivers twice to the same endpoint. If an enqueue fails the event stays unpublished and is retried.
 */
export const publishWebhookEvents = defineSystemJob<WebhookPublishDeps, z.ZodObject<{ limit: z.ZodDefault<z.ZodNumber> }>, PublishResult>({
  name: 'publishWebhookEvents',
  input: z.object({ limit: z.number().int().min(1).max(1000).default(OUTBOX_BATCH) }),
  handler: ({ deps, input }) => inTransaction(deps, (tx) => fanOut(tx, input.limit)),
});

async function fanOut(deps: WebhookPublishDeps, limit: number): Promise<PublishResult> {
  // Tasks are sent right away (not after the commit): the singleton keys make a repeated fan-out harmless.
  const { queue } = baseDeps(deps);
  const events = await deps.outbox.listUnpublished(limit);
  let published = 0;
  let enqueued = 0;
  for (const event of events) {
    if (event.type === 'ping') continue;
    const endpoints = await deps.endpoints.listForEvent(event.organizationId, event.type);
    try {
      for (const endpoint of endpoints) {
        const payload = { organizationId: event.organizationId, eventId: event.id, endpointId: endpoint.id };
        await queue.enqueue('webhook.deliver', payload, { singletonKey: `${event.id}:${endpoint.id}` });
        enqueued += 1;
      }
      const jobId = event.data['jobId'];
      if (DISTRIBUTION_EVENTS.has(event.type) && typeof jobId === 'string') {
        await queue.enqueue('distribution.sync', { organizationId: event.organizationId, jobId }, { singletonKey: event.id });
      }
      await deps.outbox.markPublished(event.organizationId, event.id, deps.now());
      published += 1;
    } catch {
      // Left unpublished on purpose: the next run fans it out again.
    }
  }
  return { published, enqueued, pending: events.length - published };
}
