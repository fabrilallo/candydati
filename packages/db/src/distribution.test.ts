import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, runMigrations, type DbHandle } from './index.js';
import { distributionSetting, job, jobDistribution, jobTrackedLink, organization } from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

let handle: DbHandle;

async function insertOrgWithJob(): Promise<{ organizationId: string; jobId: string }> {
  const organizationId = randomUUID();
  const jobId = randomUUID();
  await handle.db.insert(organization).values({ id: organizationId, name: organizationId, slug: organizationId, createdAt: new Date() });
  await handle.db.insert(job).values({ id: jobId, organizationId, slug: 'dev', title: 'Dev', content: { title: 'Dev' } as never, createdBy: 'user_1' });
  return { organizationId, jobId };
}

describe('job_distribution and distribution_setting', () => {
  beforeAll(async () => {
    const url = testDatabaseUrl();
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('stores one row per (organization, job, channel) with the channel state', async () => {
    const { organizationId, jobId } = await insertOrgWithJob();
    await handle.db.insert(jobDistribution).values({ organizationId, jobId, channelId: 'board', status: 'published', externalId: 'ext-1', url: 'https://board.test/1' });
    const [row] = await handle.db.select().from(jobDistribution).where(and(eq(jobDistribution.organizationId, organizationId), eq(jobDistribution.jobId, jobId)));
    expect(row).toMatchObject({ channelId: 'board', status: 'published', externalId: 'ext-1', url: 'https://board.test/1', error: null });
    expect(row?.updatedAt).toBeInstanceOf(Date);
  });

  it('refuses a second row for the same channel and accepts another channel', async () => {
    const { organizationId, jobId } = await insertOrgWithJob();
    const values = { organizationId, jobId, channelId: 'board', status: 'pending' as const };
    await handle.db.insert(jobDistribution).values(values);
    await expect(handle.db.insert(jobDistribution).values(values)).rejects.toThrow();
    await handle.db.insert(jobDistribution).values({ ...values, channelId: 'other' });
  });

  it('refuses a row for an unknown organization or job', async () => {
    const { organizationId, jobId } = await insertOrgWithJob();
    await expect(handle.db.insert(jobDistribution).values({ organizationId: randomUUID(), jobId, channelId: 'c', status: 'pending' })).rejects.toThrow();
    await expect(handle.db.insert(jobDistribution).values({ organizationId, jobId: randomUUID(), channelId: 'c', status: 'pending' })).rejects.toThrow();
  });

  it('keeps a channel switch per organization, enabled by default', async () => {
    const { organizationId } = await insertOrgWithJob();
    await handle.db.insert(distributionSetting).values({ organizationId, channelId: 'board' });
    const [row] = await handle.db.select().from(distributionSetting).where(eq(distributionSetting.organizationId, organizationId));
    expect(row).toMatchObject({ channelId: 'board', enabled: true });
    await expect(handle.db.insert(distributionSetting).values({ organizationId, channelId: 'board', enabled: false })).rejects.toThrow();
  });

  it('keeps one tracked link per job, channel and campaign, the empty campaign included', async () => {
    const { organizationId, jobId } = await insertOrgWithJob();
    const link = { organizationId, jobId, source: 'linkedin', createdBy: 'user_1' };
    await handle.db.insert(jobTrackedLink).values({ ...link, id: randomUUID() });
    await expect(handle.db.insert(jobTrackedLink).values({ ...link, id: randomUUID() })).rejects.toThrow();
    await handle.db.insert(jobTrackedLink).values({ ...link, id: randomUUID(), campaign: 'autumn' });
    const rows = await handle.db.select().from(jobTrackedLink).where(eq(jobTrackedLink.jobId, jobId));
    expect(rows.map((row) => row.campaign).toSorted()).toEqual(['', 'autumn']);
    await expect(handle.db.insert(jobTrackedLink).values({ ...link, id: randomUUID(), jobId: randomUUID() })).rejects.toThrow();
  });
});
