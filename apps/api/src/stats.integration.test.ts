import { completeJobContent } from '@tt/core/testing';
import { jobStatsDtoSchema, STATS_WEEKS, type JobStatsDto } from '@tt/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestUser } from './testing/client.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

const URL = '/api/v1/stats/jobs';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const newUser = (label: string) => new TestUser(t.app, uniqueEmail(label), `User ${label}`);

async function ownerOf(name: string): Promise<TestUser> {
  const owner = await newUser(name).signUp();
  await owner.createOrganization(name);
  return owner;
}

async function seed(owner: TestUser): Promise<void> {
  await owner.post('/api/v1/jobs', { content: { title: 'Bare draft' } });
  const id = (await owner.post<{ id: string }>('/api/v1/jobs', { content: completeJobContent({ title: 'Ready' }) })).body.data!.id;
  expect((await owner.post(`/api/v1/jobs/${id}/publish`)).status).toBe(200);
}

describe('GET /api/v1/stats/jobs', () => {
  it('answers 401 to anonymous callers', async () => {
    expect((await newUser('anon').get(URL)).status).toBe(401);
  });

  it('returns the envelope with figures computed from the organization ads', async () => {
    const owner = await ownerOf('Stats');
    await seed(owner);
    const reply = await owner.get<JobStatsDto>(URL);
    expect(reply.status).toBe(200);
    expect(reply.body.success).toBe(true);
    const stats = jobStatsDtoSchema.parse(reply.body.data);
    expect(stats.statusCounts).toEqual({ draft: 1, published: 1, closed: 0, total: 2 });
    expect(stats.weekly).toHaveLength(STATS_WEEKS);
    expect(stats.weekly.at(-1)).toMatchObject({ created: 2, published: 1 });
    expect(stats.quality).toMatchObject({ threshold: 6, average: 8, belowCount: 0 });
    expect(stats.quality.items.map((i) => i.title)).toEqual(['Ready']);
    expect(stats.salary.medians).toEqual([{ currency: 'EUR', period: 'year', count: 1, medianMin: 35000, medianMax: 45000 }]);
    expect(stats.process).toEqual({ jobCount: 1, averageStages: 2, averageProcessMinutes: 90, averageResponseDays: 5 });
    expect(stats.readiness).toMatchObject({ draftCount: 1, readyCount: 0 });
    expect(stats.readiness.blockers.length).toBeGreaterThan(0);
  });

  it('lets an interviewer read and audits nothing', async () => {
    const owner = await ownerOf('Readers');
    await seed(owner);
    const interviewer = await newUser('int').signUp();
    await interviewer.joinAs(owner, 'interviewer');
    const before = (await owner.get<unknown[]>('/api/v1/audit-log')).body.meta?.total;
    const reply = await interviewer.get<JobStatsDto>(URL);
    expect(reply.status).toBe(200);
    expect(reply.body.data!.statusCounts.total).toBe(2);
    expect((await owner.get<unknown[]>('/api/v1/audit-log')).body.meta?.total).toBe(before);
  });

  it('isolates organizations', async () => {
    const a = await ownerOf('Alpha');
    const b = await ownerOf('Beta');
    await seed(a);
    const stats = (await b.get<JobStatsDto>(URL)).body.data!;
    expect(stats.statusCounts).toEqual({ draft: 0, published: 0, closed: 0, total: 0 });
    expect(stats.weekly.every((w) => w.created === 0 && w.published === 0)).toBe(true);
    expect(stats.quality.items).toEqual([]);
    expect(stats.process.jobCount).toBe(0);
    expect(stats.readiness.draftCount).toBe(0);
  });
});
