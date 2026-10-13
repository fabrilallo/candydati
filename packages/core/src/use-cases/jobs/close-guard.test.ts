import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, ValidationError } from '../../errors.js';
import { buildApplication, buildAutomationRule, buildCandidate, buildJob, completeJobContent, seedAutomationWorld, userActor, ORG_A } from '../../testing/index.js';
import { closeJob } from './close-job.js';
import { publishJob } from './publish-job.js';
import { updateJob } from './update-job.js';

const recruiter = userActor({ role: 'recruiter', organizationId: ORG_A });
const NOW = new Date('2026-06-01T10:00:00.000Z');

describe('closeJob guard', () => {
  it('refuses while applications are open, with the count, and changes nothing', async () => {
    const deps = seedAutomationWorld({
      candidates: [buildCandidate({ organizationId: ORG_A }), buildCandidate({ id: 'cand_2', organizationId: ORG_A, email: 'b@x.it' })],
      applications: [
        buildApplication({ organizationId: ORG_A }),
        buildApplication({ id: 'app_2', candidateId: 'cand_2', organizationId: ORG_A, stageId: 'stage-0' }),
        buildApplication({ id: 'app_3', candidateId: 'cand_2', organizationId: ORG_A, outcome: 'hired', closedAt: NOW }),
      ],
    });
    const error = await closeJob(deps, recruiter, { jobId: 'job_1' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues).toEqual([{ path: 'applications', message: 'open_applications:2' }]);
    expect((await deps.jobs.findById(ORG_A, 'job_1'))?.status).toBe('published');
    expect(deps.outbox.snapshot()).toHaveLength(0);
    expect(deps.auditLog.events()).toHaveLength(0);
  });

  it('closes once every application has an outcome and records job.closed', async () => {
    const deps = seedAutomationWorld({ applications: [buildApplication({ organizationId: ORG_A, outcome: 'not_selected', closedAt: NOW })] });
    const job = await closeJob(deps, recruiter, { jobId: 'job_1' });
    expect(job.status).toBe('closed');
    expect(deps.outbox.snapshot()).toEqual([expect.objectContaining({ type: 'job.closed', data: { jobId: 'job_1' } })]);
  });

  it('closes a job with no applications', async () => {
    const deps = seedAutomationWorld({ applications: [], candidates: [] });
    await expect(closeJob(deps, recruiter, { jobId: 'job_1' })).resolves.toMatchObject({ status: 'closed' });
  });

  it('keeps its other rules: only published jobs, and permission', async () => {
    const draft = seedAutomationWorld({ applications: [], candidates: [], jobs: [buildJob({ id: 'job_1', organizationId: ORG_A, status: 'draft' })] });
    await expect(closeJob(draft, recruiter, { jobId: 'job_1' })).rejects.toBeInstanceOf(ConflictError);
    await expect(closeJob(seedAutomationWorld(), userActor({ role: 'hiring_manager', organizationId: ORG_A }), { jobId: 'job_1' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('counts only the job at hand, in its own organization', async () => {
    const deps = seedAutomationWorld({ applications: [buildApplication({ organizationId: ORG_A, jobId: 'other_job' })] });
    await expect(closeJob(deps, recruiter, { jobId: 'job_1' })).resolves.toMatchObject({ status: 'closed' });
  });
});

describe('job events', () => {
  it('publishJob records job.published with ids and slug only', async () => {
    const deps = seedAutomationWorld({
      applications: [],
      candidates: [],
      jobs: [buildJob({ id: 'job_1', slug: 'backend', organizationId: ORG_A, status: 'draft' })],
    });
    await publishJob(deps, recruiter, { jobId: 'job_1' });
    expect(deps.outbox.snapshot()).toEqual([expect.objectContaining({ type: 'job.published', data: { jobId: 'job_1', slug: 'backend' } })]);
  });
});

describe('updateJob removes the rules of a removed stage', () => {
  const [hr, tech] = completeJobContent().process;
  const identified = { ...completeJobContent(), process: [{ ...hr, id: 'stg-aaa' }, { ...tech, id: 'stg-bbb' }] } as ReturnType<typeof completeJobContent>;
  const seed = () =>
    seedAutomationWorld({
      applications: [],
      candidates: [],
      jobs: [buildJob({ id: 'job_1', slug: 'backend', organizationId: ORG_A, status: 'published', publishedAt: NOW, content: identified })],
      rules: [
        buildAutomationRule({ id: 'r_a', stageId: 'stg-aaa' }),
        buildAutomationRule({ id: 'r_b', stageId: 'stg-bbb' }),
        buildAutomationRule({ id: 'r_received', stageId: 'received' }),
      ],
    });

  it('deletes the rules of the stage that went away and keeps the others', async () => {
    const deps = seed();
    await updateJob(deps, recruiter, { jobId: 'job_1', content: { ...identified, process: identified.process.slice(0, 1) } });
    expect(deps.rules.snapshot().map((r) => r.id).sort()).toEqual(['r_a', 'r_received']);
  });

  it('keeps every rule when no stage is removed', async () => {
    const deps = seed();
    await updateJob(deps, recruiter, { jobId: 'job_1', content: { ...identified, summary: 'New summary.' } });
    expect(deps.rules.snapshot()).toHaveLength(3);
  });
});
