import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildJob, buildOutboxEvent, buildWebhookEndpoint, createInMemoryTaskQueue } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { publishWebhookEvents } from '../use-cases/webhooks/publish-events.js';
import { createDrizzleUnitOfWork, type DrizzleUnitOfWork } from './drizzle-repositories.js';

/** Finding #24 of the code review: the outbox publisher claims its batch, so two publishers never fan an event out twice. */
let handle: DbHandle;
let uow: DrizzleUnitOfWork;

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
  uow = createDrizzleUnitOfWork(handle.db);
});
afterAll(async () => {
  await handle.close();
});

async function buildWorld(): Promise<{ readonly org: string; readonly jobId: string }> {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  const jobId = randomUUID();
  await uow.repositories.jobs.create(buildJob({ id: jobId, slug: jobId, organizationId: org }));
  return { org, jobId };
}

describe('outbox fan-out on Postgres', () => {
  it('two publishers running at the same time fan each event out once (#24)', async () => {
    const world = await buildWorld();
    const r = uow.repositories;
    const endpoint = await r.endpoints.create(buildWebhookEndpoint({ id: randomUUID(), organizationId: world.org }));
    const events = [1, 2, 3].map((n) => buildOutboxEvent({ id: randomUUID(), organizationId: world.org, occurredAt: new Date(`2000-01-0${n}T00:00:00Z`), data: { applicationId: randomUUID(), jobId: world.jobId } }));
    for (const event of events) await r.outbox.append(event);
    const queue = createInMemoryTaskQueue();
    const deps = { endpoints: r.endpoints, outbox: r.outbox, queue, transaction: uow.transaction, now: () => new Date() };
    await Promise.all([publishWebhookEvents(deps, { limit: 1000 }), publishWebhookEvents(deps, { limit: 1000 })]);
    const mine = queue.jobs().flatMap((job) => (job.name === 'webhook.deliver' && job.payload.organizationId === world.org ? [job.payload] : []));
    expect(mine.map((payload) => payload.eventId).toSorted()).toEqual(events.map((e) => e.id).toSorted());
    expect(mine.every((payload) => payload.endpointId === endpoint.id)).toBe(true);
    for (const event of events) expect((await r.outbox.findById(world.org, event.id))?.publishedAt).not.toBeNull();
  });
});
