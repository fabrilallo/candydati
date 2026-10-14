import { z } from 'zod';
import type { TaskQueue } from '../../intake-ports.js';
import { safeErrorCode } from '../../safe-error.js';
import { baseDeps, inSavepoint, inTransaction, queuesInTransaction } from '../../transaction.js';
import { defineSystemJob } from '../../use-case.js';
import type { WebhookEventType } from '@tt/domain';
import type { PendingOutboxEvent, WebhookPublishDeps } from '../../webhook-ports.js';

/** An event whose fan-out failed this run. `code` is safe to log; `dead`: it ran out of attempts and is parked. */
export interface PublishFailure {
  readonly eventId: string;
  readonly code: string;
  readonly dead: boolean;
}

export interface PublishResult {
  /** Events fully fanned out and marked published. */
  readonly published: number;
  /** `webhook.deliver` tasks enqueued. */
  readonly enqueued: number;
  /** Events taken this run but not published (failed, or pings). */
  readonly pending: number;
  readonly failures: readonly PublishFailure[];
}

export const OUTBOX_BATCH = 100;
/** Failed fan-outs before an event is parked as dead (dead letter). */
export const OUTBOX_MAX_ATTEMPTS = 10;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 6 * 60 * 60 * 1000;

/** When an event that failed `attempts` times is due again: 30 s doubling per attempt, capped at 6 h. */
export const outboxRetryAt = (attempts: number, now: Date): Date =>
  new Date(now.getTime() + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1)));

/** Events that change what an ad looks like in the channels: they also queue a distribution sync of that job. */
const DISTRIBUTION_EVENTS: ReadonlySet<string> = new Set(['job.published', 'job.updated', 'job.closed']);

/**
 * System job: fans the outbox out. In one transaction it claims a batch of due events (`SKIP LOCKED`: a second
 * publisher takes other events), and for each one, in a savepoint of its own, queues one `webhook.deliver` task per
 * enabled endpoint of the event's organization that subscribes to its type, plus one `distribution.sync` for job
 * events, then marks the event published. A failing event is rolled back alone: its attempt is counted with a short
 * code and a backoff, and after OUTBOX_MAX_ATTEMPTS it is parked (dead letter); newer events go on. Every delivery task
 * has the singleton key `event:endpoint`, so an event fanned out again never delivers twice to the same endpoint.
 */
export const publishWebhookEvents = defineSystemJob<WebhookPublishDeps, z.ZodObject<{ limit: z.ZodDefault<z.ZodNumber> }>, PublishResult>({
  name: 'publishWebhookEvents',
  input: z.object({ limit: z.number().int().min(1).max(1000).default(OUTBOX_BATCH) }),
  handler: ({ deps, input }) => inTransaction(deps, (tx) => fanOut(tx, input.limit)),
});

/** pg-boss bound to the transaction when it owns the queue; otherwise sent right away (the singleton keys make a repeat harmless). */
const queueOf = (deps: WebhookPublishDeps): TaskQueue => (queuesInTransaction(deps) ? deps.queue : baseDeps(deps).queue);

type PublishableEvent = PendingOutboxEvent & { readonly type: WebhookEventType };

async function fanOutOne(deps: WebhookPublishDeps, event: PublishableEvent): Promise<number> {
  const queue = queueOf(deps);
  const endpoints = await deps.endpoints.listForEvent(event.organizationId, event.type);
  for (const endpoint of endpoints) {
    const payload = { organizationId: event.organizationId, eventId: event.id, endpointId: endpoint.id };
    await queue.enqueue('webhook.deliver', payload, { singletonKey: `${event.id}:${endpoint.id}` });
  }
  const jobId = event.data['jobId'];
  if (DISTRIBUTION_EVENTS.has(event.type) && typeof jobId === 'string') {
    await queue.enqueue('distribution.sync', { organizationId: event.organizationId, jobId }, { singletonKey: event.id });
  }
  await deps.outbox.markPublished(event.organizationId, event.id, deps.now());
  return endpoints.length;
}

async function recordFailure(deps: WebhookPublishDeps, event: PendingOutboxEvent, error: unknown): Promise<PublishFailure> {
  const now = deps.now();
  const attempts = event.attempts + 1;
  const dead = attempts >= OUTBOX_MAX_ATTEMPTS;
  const code = safeErrorCode(error);
  await deps.outbox.recordFailure(event.organizationId, event.id, { attempts, lastError: code, nextAttemptAt: dead ? null : outboxRetryAt(attempts, now), deadAt: dead ? now : null });
  return { eventId: event.id, code, dead };
}

async function fanOut(deps: WebhookPublishDeps, limit: number): Promise<PublishResult> {
  const events = await deps.outbox.listUnpublished(limit, deps.now());
  let published = 0;
  let enqueued = 0;
  const failures: PublishFailure[] = [];
  for (const event of events) {
    const { type } = event;
    if (type === 'ping') continue;
    try {
      enqueued += await inSavepoint(deps, (sp) => fanOutOne(sp, { ...event, type }));
      published += 1;
    } catch (error) {
      failures.push(await recordFailure(deps, event, error));
    }
  }
  return { published, enqueued, pending: events.length - published, failures };
}
