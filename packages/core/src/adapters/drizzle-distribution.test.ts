import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDrizzleJobDistributions, createDrizzleDistributionSettings } from './drizzle-distribution.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';

let handle: DbHandle;
beforeAll(async () => {
  handle = createDb(coreTestDatabaseUrl(), 2);
});
afterAll(async () => {
  await handle.close();
});

async function seed(): Promise<{ organizationId: string; jobId: string }> {
  const organizationId = randomUUID();
  const jobId = randomUUID();
  await handle.db.insert(schema.organization).values({ id: organizationId, name: organizationId, slug: organizationId, createdAt: new Date() });
  await handle.db.insert(schema.job).values({ id: jobId, organizationId, slug: 'dev', title: 'Dev', content: { title: 'Dev' } as never, createdBy: 'u' });
  return { organizationId, jobId };
}

const row = (organizationId: string, jobId: string, channelId: string, overrides = {}) => ({
  organizationId, jobId, channelId, status: 'pending' as const, externalId: null, url: null, error: null, updatedAt: new Date('2026-06-01T10:00:00Z'), ...overrides,
});

describe('createDrizzleJobDistributions', () => {
  it('upserts one row per channel, finds it and lists a job channels in order', async () => {
    const repository = createDrizzleJobDistributions(handle.db);
    const { organizationId, jobId } = await seed();
    await repository.save(row(organizationId, jobId, 'b-board'));
    await repository.save(row(organizationId, jobId, 'a-board'));
    await repository.save(row(organizationId, jobId, 'b-board', { status: 'published', externalId: 'x1', url: 'https://b.test/1', updatedAt: new Date('2026-06-02T10:00:00Z') }));
    expect((await repository.listByJob(organizationId, jobId)).map((r) => [r.channelId, r.status])).toEqual([['a-board', 'pending'], ['b-board', 'published']]);
    expect(await repository.find(organizationId, jobId, 'b-board')).toEqual(row(organizationId, jobId, 'b-board', { status: 'published', externalId: 'x1', url: 'https://b.test/1', updatedAt: new Date('2026-06-02T10:00:00Z') }));
    expect(await repository.find(organizationId, jobId, 'none')).toBeNull();
  });

  it('never returns the rows of another organization', async () => {
    const repository = createDrizzleJobDistributions(handle.db);
    const a = await seed();
    const b = await seed();
    await repository.save(row(a.organizationId, a.jobId, 'board'));
    expect(await repository.listByJob(b.organizationId, a.jobId)).toEqual([]);
    expect(await repository.find(b.organizationId, a.jobId, 'board')).toBeNull();
  });
});

describe('createDrizzleDistributionSettings', () => {
  it('upserts the switch per organization and channel', async () => {
    const repository = createDrizzleDistributionSettings(handle.db);
    const [a, b] = [await seed(), await seed()];
    await repository.save({ organizationId: a.organizationId, channelId: 'board', enabled: false, updatedAt: new Date('2026-06-01T10:00:00Z') });
    await repository.save({ organizationId: a.organizationId, channelId: 'board', enabled: true, updatedAt: new Date('2026-06-02T10:00:00Z') });
    await repository.save({ organizationId: a.organizationId, channelId: 'other', enabled: false, updatedAt: new Date('2026-06-02T10:00:00Z') });
    expect((await repository.list(a.organizationId)).map((s) => [s.channelId, s.enabled])).toEqual([['board', true], ['other', false]]);
    expect(await repository.list(b.organizationId)).toEqual([]);
  });
});
