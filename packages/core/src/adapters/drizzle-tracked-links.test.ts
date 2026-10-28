import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import type { TrackedLink } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleTrackedLinks } from './drizzle-tracked-links.js';

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

const link = (organizationId: string, jobId: string, overrides: Partial<TrackedLink> = {}): TrackedLink => ({
  id: randomUUID(), organizationId, jobId, source: 'linkedin', campaign: '', createdBy: 'u', createdAt: new Date('2026-10-01T10:00:00Z'), ...overrides,
});

describe('createDrizzleTrackedLinks', () => {
  it('saves a pair once, lists and counts the links of a job oldest first', async () => {
    const repository = createDrizzleTrackedLinks(handle.db);
    const { organizationId, jobId } = await seed();
    const first = link(organizationId, jobId);
    expect(await repository.insertIfAbsent(first)).toEqual({ link: first, created: true });
    expect(await repository.insertIfAbsent(link(organizationId, jobId))).toEqual({ link: first, created: false });
    const second = link(organizationId, jobId, { campaign: 'autumn', createdAt: new Date('2026-10-02T10:00:00Z') });
    await repository.insertIfAbsent(second);
    expect((await repository.listByJob(organizationId, jobId)).map((row) => row.id)).toEqual([first.id, second.id]);
    expect(await repository.countByJob(organizationId, jobId)).toBe(2);
  });

  it('removes only a link of the given organization and job', async () => {
    const repository = createDrizzleTrackedLinks(handle.db);
    const { organizationId, jobId } = await seed();
    const other = await seed();
    const saved = link(organizationId, jobId);
    await repository.insertIfAbsent(saved);
    expect(await repository.remove(other.organizationId, jobId, saved.id)).toBe(false);
    expect(await repository.remove(organizationId, other.jobId, saved.id)).toBe(false);
    expect(await repository.listByJob(other.organizationId, jobId)).toEqual([]);
    expect(await repository.remove(organizationId, jobId, saved.id)).toBe(true);
    expect(await repository.countByJob(organizationId, jobId)).toBe(0);
  });
});
