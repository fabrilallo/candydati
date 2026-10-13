import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../errors.js';
import { buildJob, createInMemoryJobRepository, createTestJobDeps, userActor } from '../../testing/index.js';
import { getJob } from './get-job.js';
import { listJobs } from './list-jobs.js';

const actor = userActor({ role: 'interviewer', organizationId: 'org_a' });
const at = (n: number) => new Date(2026, 0, n);

const deps = () =>
  createTestJobDeps({
    jobs: createInMemoryJobRepository([
      buildJob({ id: 'a1', slug: 'a1', organizationId: 'org_a', updatedAt: at(1) }),
      buildJob({ id: 'a2', slug: 'a2', organizationId: 'org_a', updatedAt: at(3), status: 'published' }),
      buildJob({ id: 'a3', slug: 'a3', organizationId: 'org_a', updatedAt: at(2) }),
      buildJob({ id: 'b1', slug: 'b1', organizationId: 'org_b', updatedAt: at(9) }),
    ]),
  });

describe('getJob', () => {
  it('lets every role read and audits nothing', async () => {
    const d = deps();
    for (const role of ['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer'] as const) {
      const job = await getJob(d, userActor({ role, organizationId: 'org_a' }), { jobId: 'a1' });
      expect(job.id).toBe('a1');
    }
    expect(d.auditLog.events()).toHaveLength(0);
  });

  it('answers not found for other organizations and unknown ids', async () => {
    await expect(getJob(deps(), actor, { jobId: 'b1' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getJob(deps(), actor, { jobId: 'zzz' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('validates the job id', async () => {
    await expect(getJob(deps(), actor, {})).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('listJobs', () => {
  it('lists newest first scoped to the organization with defaults', async () => {
    const page = await listJobs(deps(), actor, {});
    expect(page.items.map((j) => j.id)).toEqual(['a2', 'a3', 'a1']);
    expect(page.meta).toEqual({ total: 3, page: 1, limit: 20 });
  });

  it('filters by status and paginates', async () => {
    const published = await listJobs(deps(), actor, { status: 'published' });
    expect(published.items.map((j) => j.id)).toEqual(['a2']);
    const second = await listJobs(deps(), actor, { page: '2', limit: '2' });
    expect(second.items.map((j) => j.id)).toEqual(['a1']);
  });

  it('rejects bad paging and unknown status', async () => {
    await expect(listJobs(deps(), actor, { limit: 1000 })).rejects.toBeInstanceOf(ValidationError);
    await expect(listJobs(deps(), actor, { status: 'x' })).rejects.toBeInstanceOf(ValidationError);
  });
});
