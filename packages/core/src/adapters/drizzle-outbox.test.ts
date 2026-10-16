import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BindableTaskQueue, SqlExecutor } from '../intake-ports.js';
import { buildOutboxEvent, buildWebhookDelivery, buildWebhookEndpoint } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { publishWebhookEvents } from '../use-cases/webhooks/publish-events.js';
import { createDrizzleUnitOfWork } from './drizzle-repositories.js';

let handle: DbHandle;

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

/** Sends nothing, but a delivery for `poisoned` runs a failing statement on the transaction's connection. */
const poisonQueue = (poisoned: string, sent: string[], executor?: SqlExecutor): BindableTaskQueue => ({
  async enqueue(_name, payload) {
    const eventId = (payload as { eventId?: string }).eventId;
    if (eventId === poisoned && executor) await executor.executeSql('select 1/0');
    if (eventId) sent.push(eventId);
  },
  bindTo: (bound) => poisonQueue(poisoned, sent, bound),
});

async function organization(): Promise<string> {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  return org;
}

describe('outbox on Postgres (#8)', () => {
  it('a poisoned head of the queue fails alone: newer events are published in the same run, the failure is recorded', async () => {
    const sent: string[] = [];
    const poisoned = randomUUID();
    const queue = poisonQueue(poisoned, sent);
    const uow = createDrizzleUnitOfWork(handle.db, undefined, queue);
    const r = uow.repositories;
    const org = await organization();
    await r.endpoints.create(buildWebhookEndpoint({ id: randomUUID(), organizationId: org, events: ['application.received'] }));
    const healthy = randomUUID();
    const old = new Date('2000-01-01T00:00:00Z');
    await r.outbox.append(buildOutboxEvent({ id: poisoned, organizationId: org, occurredAt: old }));
    await r.outbox.append(buildOutboxEvent({ id: healthy, organizationId: org, occurredAt: new Date('2000-01-01T00:00:01Z') }));
    const now = new Date();
    const result = await publishWebhookEvents({ transaction: uow.transaction, endpoints: r.endpoints, outbox: r.outbox, queue, now: () => now }, { limit: 1000 });
    expect(result.failures).toContainEqual({ eventId: poisoned, code: 'pg_22012', dead: false });
    expect(sent).toContain(healthy);
    expect(sent).not.toContain(poisoned);
    expect(await r.outbox.findById(org, healthy)).toMatchObject({ publishedAt: now });
    expect(await r.outbox.findWithAttempts(org, poisoned)).toMatchObject({ publishedAt: null, attempts: 1, lastError: 'pg_22012', deadAt: null });
    const later = (await r.outbox.listUnpublished(1000, now)).map((e) => e.id);
    expect(later).not.toContain(poisoned);
  });

  it('prunes published and dead events and delivery rows older than the cutoff, and keeps the rest', async () => {
    const uow = createDrizzleUnitOfWork(handle.db);
    const r = uow.repositories;
    const org = await organization();
    const endpoint = buildWebhookEndpoint({ id: randomUUID(), organizationId: org });
    await r.endpoints.create(endpoint);
    const old = new Date('2001-01-01T00:00:00Z');
    const ids = { published: randomUUID(), dead: randomUUID(), pending: randomUUID(), recent: randomUUID() };
    await r.outbox.append(buildOutboxEvent({ id: ids.published, organizationId: org, publishedAt: old }));
    await r.outbox.append(buildOutboxEvent({ id: ids.dead, organizationId: org }));
    await r.outbox.recordFailure(org, ids.dead, { attempts: 10, lastError: 'Error', nextAttemptAt: null, deadAt: old });
    await r.outbox.append(buildOutboxEvent({ id: ids.pending, organizationId: org, occurredAt: old }));
    await r.outbox.append(buildOutboxEvent({ id: ids.recent, organizationId: org, publishedAt: new Date() }));
    await r.deliveries.append(buildWebhookDelivery({ id: randomUUID(), organizationId: org, endpointId: endpoint.id, eventId: ids.published, createdAt: old }));
    const recentDelivery = buildWebhookDelivery({ id: randomUUID(), organizationId: org, endpointId: endpoint.id, eventId: ids.recent, createdAt: new Date() });
    await r.deliveries.append(recentDelivery);
    const cutoff = new Date('2002-01-01T00:00:00Z');
    expect(await r.outbox.prune(cutoff)).toBeGreaterThanOrEqual(2);
    expect(await r.deliveries.prune(cutoff)).toBeGreaterThanOrEqual(1);
    expect(await r.outbox.findById(org, ids.published)).toBeNull();
    expect(await r.outbox.findById(org, ids.dead)).toBeNull();
    expect(await r.outbox.findById(org, ids.pending)).not.toBeNull();
    expect(await r.outbox.findById(org, ids.recent)).not.toBeNull();
    expect((await r.deliveries.listByEndpoint(org, endpoint.id, 100)).map((d) => d.id)).toEqual([recentDelivery.id]);
  });
});
