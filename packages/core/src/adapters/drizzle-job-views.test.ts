import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from '@candydati/db';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleJobViews } from './drizzle-job-views.js';

let handle: DbHandle;
beforeAll(async () => {
  handle = createDb(coreTestDatabaseUrl(), 6);
});
afterAll(async () => {
  await handle.close();
});

async function world() {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: org, slug: org, createdAt: new Date() });
  const jobId = randomUUID();
  await handle.db.insert(schema.job).values({ id: jobId, organizationId: org, slug: jobId, title: 'T', content: {} as never, createdBy: 'u' });
  return { org, jobId };
}

const rowsOf = (jobId: string) => handle.db.select().from(schema.jobViewDaily).where(eq(schema.jobViewDaily.jobId, jobId));

describe('createDrizzleJobViews', () => {
  it('creates the counter, then increments the same row', async () => {
    const w = await world();
    const views = createDrizzleJobViews(handle.db);
    const key = { organizationId: w.org, jobId: w.jobId, day: '2026-10-16', source: 'linkedin', campaign: 'autumn' };
    await views.increment(key);
    await views.increment(key);
    await views.increment(key, 5);
    const rows = await rowsOf(w.jobId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ...key, views: 7 });
  });

  it('keeps day, source and campaign apart', async () => {
    const w = await world();
    const views = createDrizzleJobViews(handle.db);
    const key = { organizationId: w.org, jobId: w.jobId, day: '2026-10-16', source: 'linkedin', campaign: '' };
    await views.increment(key);
    await views.increment({ ...key, day: '2026-10-17' });
    await views.increment({ ...key, source: 'indeed' });
    await views.increment({ ...key, campaign: 'autumn' });
    expect(await rowsOf(w.jobId)).toHaveLength(4);
  });

  it('loses no visit under concurrency', async () => {
    const w = await world();
    const views = createDrizzleJobViews(handle.db);
    const key = { organizationId: w.org, jobId: w.jobId, day: '2026-10-16', source: 'direct', campaign: '' };
    await Promise.all(Array.from({ length: 40 }, () => views.increment(key)));
    expect((await rowsOf(w.jobId))[0]?.views).toBe(40);
  });

  it('purges the days before the cutoff, and only those', async () => {
    const w = await world();
    const views = createDrizzleJobViews(handle.db);
    const key = { organizationId: w.org, jobId: w.jobId, source: 'direct', campaign: '' };
    await views.increment({ ...key, day: '1999-01-01' });
    await views.increment({ ...key, day: '1999-01-02' });
    await views.increment({ ...key, day: '2026-10-16' });
    expect(await views.purgeBefore('1999-01-02')).toBeGreaterThanOrEqual(1);
    expect((await rowsOf(w.jobId)).map((r) => r.day).sort()).toEqual(['1999-01-02', '2026-10-16']);
  });
});
