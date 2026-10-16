import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleAuditLog } from './drizzle-audit-log.js';

let handle: DbHandle;
let orgA: string;
let orgB: string;

const insertOrg = async (): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(schema.organization).values({ id, name: id, slug: id, createdAt: new Date() });
  return id;
};

const event = (organizationId: string, action: 'member.added' | 'member.removed' = 'member.added') => ({
  organizationId,
  actor: { type: 'user' as const, id: 'u1', onBehalfOfUserId: null },
  action,
  target: { type: 'member', id: 'm1' },
  metadata: { role: 'recruiter' },
});

beforeAll(async () => {
  handle = createDb(coreTestDatabaseUrl(), 2);
  orgA = await insertOrg();
  orgB = await insertOrg();
});
afterAll(async () => {
  await handle.close();
});

describe('createDrizzleAuditLog', () => {
  it('appends and returns the stored event with id and date', async () => {
    const log = createDrizzleAuditLog(handle.db);
    const stored = await log.append(event(orgA));
    expect(stored.id).toBeTruthy();
    expect(stored.occurredAt).toBeInstanceOf(Date);
    expect(stored).toMatchObject({ ...event(orgA), metadata: { role: 'recruiter' } });
  });

  it('defaults metadata and keeps agent delegation', async () => {
    const log = createDrizzleAuditLog(handle.db);
    const stored = await log.append({
      organizationId: orgB,
      actor: { type: 'agent', id: 'assistant', onBehalfOfUserId: 'u9' },
      action: 'member.added',
      target: { type: 'member', id: 'm2' },
    });
    expect(stored.metadata).toEqual({});
    expect(stored.actor).toEqual({ type: 'agent', id: 'assistant', onBehalfOfUserId: 'u9' });
  });

  it('rejects an invalid event before touching the database', async () => {
    const log = createDrizzleAuditLog(handle.db);
    await expect(log.append({ ...event(orgA), organizationId: '' })).rejects.toThrow();
  });

  it('lists newest first, paginated, filtered, and always scoped to the organization', async () => {
    const log = createDrizzleAuditLog(handle.db);
    const org = await insertOrg();
    const other = await insertOrg();
    const ids: string[] = [];
    for (const action of ['member.added', 'member.removed', 'member.added'] as const) {
      ids.push((await log.append(event(org, action))).id);
    }
    await log.append(event(other));

    const first = await log.list({ organizationId: org, page: 1, limit: 2 });
    expect(first.total).toBe(3);
    expect(first.items.map((e) => e.id)).toEqual([ids[2], ids[1]]);
    const second = await log.list({ organizationId: org, page: 2, limit: 2 });
    expect(second.items.map((e) => e.id)).toEqual([ids[0]]);

    const removed = await log.list({ organizationId: org, page: 1, limit: 10, action: 'member.removed' });
    expect(removed.total).toBe(1);
    expect(removed.items.every((e) => e.organizationId === org)).toBe(true);
  });

  it('returns nothing for an organization without events', async () => {
    const log = createDrizzleAuditLog(handle.db);
    expect(await log.list({ organizationId: 'nope', page: 1, limit: 10 })).toEqual({ items: [], total: 0 });
  });
});
