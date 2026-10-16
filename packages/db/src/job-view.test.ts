import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createDb, runMigrations, type DbHandle } from './index.js';
import { application, candidate, job, jobViewDaily, organization } from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

const url = testDatabaseUrl();
let handle: DbHandle;

async function world() {
  const org = randomUUID();
  await handle.db.insert(organization).values({ id: org, name: org, slug: org, createdAt: new Date() });
  const jobId = randomUUID();
  await handle.db.insert(job).values({ id: jobId, organizationId: org, slug: jobId, title: 'T', content: {} as never, createdBy: 'u' });
  return { org, jobId };
}

describe('tracked links tables', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('keeps one counter per organization, job, day, source and campaign, with no campaign as the empty string', async () => {
    const w = await world();
    const key = { organizationId: w.org, jobId: w.jobId, day: '2026-10-16', source: 'linkedin' };
    await handle.db.insert(jobViewDaily).values({ ...key, views: 1 });
    await handle.db.insert(jobViewDaily).values({ ...key, campaign: 'autumn', views: 1 });
    await expect(handle.db.insert(jobViewDaily).values({ ...key, views: 1 })).rejects.toThrow();
    const rows = await handle.db.select().from(jobViewDaily).where(eq(jobViewDaily.jobId, w.jobId));
    expect(rows.map((r) => r.campaign).sort()).toEqual(['', 'autumn']);
    expect(rows[0]?.day).toBe('2026-10-16');
  });

  it('refuses a counter for a job that does not exist', async () => {
    const w = await world();
    await expect(handle.db.insert(jobViewDaily).values({ organizationId: w.org, jobId: randomUUID(), day: '2026-10-16', source: 'x', views: 1 })).rejects.toThrow();
  });

  it('stores the campaign of an application, null by default', async () => {
    const w = await world();
    const candidateId = randomUUID();
    await handle.db.insert(candidate).values({ id: candidateId, organizationId: w.org, firstName: 'A', lastName: 'B', email: `${candidateId}@x.it`, retentionExpiresAt: new Date() });
    const base = { organizationId: w.org, jobId: w.jobId, candidateId, stageId: 'received', cvKey: 'k', cvFileName: 'cv.pdf', cvMediaType: 'application/pdf', cvSizeBytes: 1, consent: {} as never, retentionExpiresAt: new Date(), source: 'careers_page' as const };
    const first = randomUUID();
    await handle.db.insert(application).values({ ...base, id: first });
    const [row] = await handle.db.select({ c: application.originCampaign }).from(application).where(and(eq(application.id, first)));
    expect(row?.c).toBeNull();
  });
});
