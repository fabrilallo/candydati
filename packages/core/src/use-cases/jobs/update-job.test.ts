import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildJob, completeJobContent, createInMemoryJobRepository, createTestJobDeps, userActor } from '../../testing/index.js';
import { updateJob } from './update-job.js';

const actor = userActor({ role: 'recruiter', organizationId: 'org_a' });
const seeded = (overrides = {}) => {
  const job = buildJob({ organizationId: 'org_a', ...overrides });
  return { job, deps: createTestJobDeps({ jobs: createInMemoryJobRepository([job]) }) };
};

describe('updateJob', () => {
  it('replaces the content, keeps slug and status, bumps updatedAt and audits', async () => {
    const { job, deps } = seeded();
    const content = { title: 'New title' };
    const updated = await updateJob(deps, actor, { jobId: job.id, content });
    expect(updated.content.title).toBe('New title');
    expect(updated.content.summary).toBe('');
    expect(updated.slug).toBe(job.slug);
    expect(updated.status).toBe('draft');
    expect(updated.updatedAt).toEqual(deps.now());
    expect(job.content.title).toBe('Backend Developer');
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'job.updated', target: { type: 'job', id: job.id } });
  });

  it('refuses a closed job', async () => {
    const { job, deps } = seeded({ status: 'closed' });
    await expect(updateJob(deps, actor, { jobId: job.id, content: { title: 'x' } })).rejects.toBeInstanceOf(ConflictError);
  });

  it('keeps a published job publishable', async () => {
    const { job, deps } = seeded({ status: 'published' });
    const error = await updateJob(deps, actor, { jobId: job.id, content: { title: 'x' } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues).toContainEqual({ path: 'salary.min', message: 'required' });
    expect(deps.auditLog.events()).toHaveLength(0);
    await expect(
      updateJob(deps, actor, { jobId: job.id, content: completeJobContent({ title: 'Ok' }) }),
    ).resolves.toMatchObject({ status: 'published' });
  });

  it('hides jobs of other organizations as not found', async () => {
    const { job, deps } = seeded({ organizationId: 'org_b' });
    await expect(updateJob(deps, actor, { jobId: job.id, content: { title: 'x' } })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects invalid content and missing jobs', async () => {
    const { deps } = seeded();
    await expect(updateJob(deps, actor, { jobId: 'job_1', content: {} })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateJob(deps, actor, { jobId: 'nope', content: { title: 'x' } })).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each(['owner', 'admin', 'recruiter', 'hiring_manager'] as const)('allows %s', async (role) => {
    const { job, deps } = seeded();
    await expect(updateJob(deps, userActor({ role, organizationId: 'org_a' }), { jobId: job.id, content: { title: 'x' } })).resolves.toBeDefined();
  });

  it('denies interviewer', async () => {
    const { job, deps } = seeded();
    await expect(
      updateJob(deps, userActor({ role: 'interviewer', organizationId: 'org_a' }), { jobId: job.id, content: { title: 'x' } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
