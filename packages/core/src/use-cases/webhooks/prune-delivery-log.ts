import { DAY_MS } from '@candydati/domain';
import { z } from 'zod';
import { defineSystemJob } from '../../use-case.js';
import type { OutboxRepository, WebhookDeliveryRepository } from '../../webhook-ports.js';

/** Days published or dead outbox events and webhook delivery rows are kept, unless configured otherwise. */
export const DELIVERY_LOG_RETENTION_DAYS = 30;

export interface DeliveryLogDeps {
  readonly outbox: Pick<OutboxRepository, 'prune'>;
  readonly deliveries: Pick<WebhookDeliveryRepository, 'prune'>;
}

export interface DeliveryLogPruneResult {
  readonly events: number;
  readonly deliveries: number;
}

/**
 * Daily system job: deletes outbox events published or parked (dead) and webhook delivery rows older than
 * `retentionDays`. Events still waiting to be published are never touched. Spans organizations.
 */
export const pruneDeliveryLog = defineSystemJob<DeliveryLogDeps, z.ZodObject<{ now: z.ZodDate; retentionDays: z.ZodDefault<z.ZodNumber> }>, DeliveryLogPruneResult>({
  name: 'pruneDeliveryLog',
  input: z.object({ now: z.date(), retentionDays: z.number().int().min(1).max(3650).default(DELIVERY_LOG_RETENTION_DAYS) }),
  handler: async ({ deps, input }) => {
    const before = new Date(input.now.getTime() - input.retentionDays * DAY_MS);
    return { events: await deps.outbox.prune(before), deliveries: await deps.deliveries.prune(before) };
  },
});
