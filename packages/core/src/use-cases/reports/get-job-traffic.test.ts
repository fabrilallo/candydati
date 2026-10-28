import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildApplication, buildCandidate, buildJob, ORG_A, ORG_B, seedCandidateWorld, userActor } from '../../testing/index.js';
import { getJobTraffic } from './get-job-traffic.js';

const job = (id: string, organizationId = ORG_A) => buildJob({ id, slug: id, organizationId, status: 'published', publishedAt: new Date('2026-09-01T00:00:00Z') });
const app = (id: string, createdAt: string, origin: string, originCampaign: string | null = null, jobId = 'job_1', organizationId = ORG_A) =>
  buildApplication({ id, organizationId, jobId, candidateId: 'cand_1', createdAt: new Date(createdAt), origin, originCampaign });

async function world() {
  const deps = seedCandidateWorld({
    jobs: [job('job_1'), job('job_2'), job('job_b', ORG_B)],
    candidates: [buildCandidate({ id: 'cand_1', organizationId: ORG_A })],
    extractions: [],
    applications: [
      app('a1', '2026-10-02T09:00:00Z', 'linkedin', 'autumn'),
      app('a2', '2026-10-02T23:30:00Z', 'linkedin', 'autumn'),
      app('a3', '2026-10-03T10:00:00Z', 'direct'),
      app('a4', '2026-09-01T10:00:00Z', 'linkedin'),
      app('a5', '2026-10-02T10:00:00Z', 'linkedin', null, 'job_2'),
      app('a6', '2026-10-02T10:00:00Z', 'linkedin', null, 'job_b', ORG_B),
    ],
  });
  const views = [
    { organizationId: ORG_A, jobId: 'job_1', day: '2026-10-02', source: 'linkedin', campaign: 'autumn', views: 4 },
    { organizationId: ORG_A, jobId: 'job_1', day: '2026-10-04', source: 'direct', campaign: '', views: 2 },
    { organizationId: ORG_A, jobId: 'job_1', day: '2026-08-01', source: 'direct', campaign: '', views: 9 },
    { organizationId: ORG_A, jobId: 'job_2', day: '2026-10-02', source: 'linkedin', campaign: '', views: 7 },
    { organizationId: ORG_B, jobId: 'job_b', day: '2026-10-02', source: 'linkedin', campaign: '', views: 5 },
  ];
  deps.store.write({ jobViews: views });
  return deps;
}

const owner = userActor({ role: 'owner', organizationId: ORG_A });
const period = { from: '2026-10-01T00:00:00Z', to: '2026-10-28T23:59:59Z' };

describe('getJobTraffic', () => {
  it('gives visits and applications of the job per day, source and campaign, in day order', async () => {
    const result = await getJobTraffic(await world(), owner, { ...period, jobId: 'job_1' });
    expect(result).toEqual({
      jobId: 'job_1',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-28T23:59:59.000Z',
      rows: [
        { day: '2026-10-02', origin: 'linkedin', campaign: 'autumn', visits: 4, applications: 2 },
        { day: '2026-10-03', origin: 'direct', campaign: '', visits: 0, applications: 1 },
        { day: '2026-10-04', origin: 'direct', campaign: '', visits: 2, applications: 0 },
      ],
    });
  });

  it('is empty outside the data', async () => {
    const result = await getJobTraffic(await world(), owner, { jobId: 'job_1', from: '2025-01-01T00:00:00Z', to: '2025-01-31T00:00:00Z' });
    expect(result.rows).toEqual([]);
  });

  it('needs report:read, like the sources of the reports', async () => {
    await expect(getJobTraffic(await world(), userActor({ role: 'interviewer', organizationId: ORG_A }), { ...period, jobId: 'job_1' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('answers not found for a job of another organization or one that does not exist', async () => {
    await expect(getJobTraffic(await world(), owner, { ...period, jobId: 'job_b' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getJobTraffic(await world(), owner, { ...period, jobId: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses an invalid period', async () => {
    await expect(getJobTraffic(await world(), owner, { jobId: 'job_1', from: '2026-10-28', to: '2026-10-01' })).rejects.toBeInstanceOf(ValidationError);
  });
});
