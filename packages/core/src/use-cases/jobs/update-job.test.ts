import type { StageType } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import {
  buildApplication,
  buildJob,
  completeJobContent,
  createCandidateStore,
  createInMemoryApplicationCounts,
  createInMemoryJobRepository,
  createTestJobDeps,
  agentActor,
  userActor,
} from '../../testing/index.js';
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

  it('records a job.updated event for a published job, and none for a draft', async () => {
    const published = seeded({ status: 'published', publishedAt: new Date('2026-05-01T00:00:00Z') });
    await updateJob(published.deps, actor, { jobId: published.job.id, content: completeJobContent({ title: 'Edited' }) });
    expect(published.deps.outbox.snapshot()).toEqual([
      expect.objectContaining({ organizationId: 'org_a', type: 'job.updated', data: { jobId: published.job.id, slug: published.job.slug }, publishedAt: null }),
    ]);
    const draft = seeded();
    await updateJob(draft.deps, actor, { jobId: draft.job.id, content: { title: 'Edited' } });
    expect(draft.deps.outbox.snapshot()).toEqual([]);
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

describe('updateJob guards', () => {
  it('lets the assistant edit drafts only, whatever adapter calls it (#26)', async () => {
    const assistant = agentActor({ role: 'recruiter', organizationId: 'org_a', onBehalfOfUserId: 'user_test' });
    const draft = seeded();
    await expect(updateJob(draft.deps, assistant, { jobId: draft.job.id, content: { title: 'By the assistant' } })).resolves.toMatchObject({ status: 'draft' });
    const live = seeded({ status: 'published', publishedAt: new Date('2026-05-01T00:00:00Z') });
    await expect(updateJob(live.deps, assistant, { jobId: live.job.id, content: completeJobContent({ title: 'Live' }) })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await live.deps.jobs.findById('org_a', live.job.id))?.content.title).toBe('Backend Developer');
  });

  it('refuses an edit that arrives after the job was published or closed meanwhile (#4, #26)', async () => {
    const { job, deps } = seeded();
    const stale = { ...deps, jobs: { ...deps.jobs, findById: async () => job } };
    await deps.jobs.transition('org_a', job.id, 'draft', { status: 'published', quality: null, publishedAt: deps.now(), updatedAt: deps.now() });
    await expect(updateJob(stale, actor, { jobId: job.id, content: { title: 'Late' } })).rejects.toBeInstanceOf(ConflictError);
    expect(await deps.jobs.findById('org_a', job.id)).toMatchObject({ status: 'published', content: { title: 'Backend Developer' } });
  });

  it('keeps a published job inside its approved budget when approval is required, comparing yearly amounts (#7)', async () => {
    const { job, deps } = seeded({ status: 'published', publishedAt: new Date('2026-05-01T00:00:00Z') });
    await deps.organizationSettings.setRequireApproval('org_a', true, deps.now());
    await deps.approvals.set('org_a', job.id, { approvedBy: 'admin', approvedAt: deps.now(), salaryMin: 40000, salaryMax: 50000, currency: 'EUR' });
    const salary = (max: number, period: 'year' | 'month') => completeJobContent({ title: 'Backend Developer', salary: { min: Math.round(max * 0.8), max, currency: 'EUR', period } });
    const beyond = await updateJob(deps, actor, { jobId: job.id, content: salary(90000, 'year') }).catch((e: unknown) => e);
    expect(beyond).toBeInstanceOf(ValidationError);
    expect((beyond as ValidationError).issues).toEqual([{ path: 'approval', message: 'approval_range_exceeded' }]);
    await expect(updateJob(deps, actor, { jobId: job.id, content: salary(10000, 'month') })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateJob(deps, actor, { jobId: job.id, content: salary(4000, 'month') })).resolves.toMatchObject({ content: { salary: { max: 4000, period: 'month' } } });
    // A draft is checked when it is published, not while it is written.
    const draft = seeded();
    await draft.deps.organizationSettings.setRequireApproval('org_a', true, draft.deps.now());
    await expect(updateJob(draft.deps, actor, { jobId: draft.job.id, content: salary(90000, 'year') })).resolves.toBeDefined();
  });
});

describe('updateJob stage ids', () => {
  const stage = (id: string | undefined, type: StageType = 'hr_interview') => ({
    ...(id === undefined ? {} : { id }),
    type,
    durationMinutes: 30,
    conductedBy: 'recruiter' as const,
  });
  const withProcess = (process: readonly ReturnType<typeof stage>[]) => completeJobContent({ title: 'Dev', process: [...process] });

  const seededWithApplications = (applications: Parameters<typeof buildApplication>[0][]) => {
    const job = buildJob({
      organizationId: 'org_a',
      status: 'published',
      content: withProcess([stage('stg-a'), stage('stg-b', 'technical_interview'), stage('stg-c', 'final_interview')]),
    });
    const store = createCandidateStore({ applications: applications.map((a) => buildApplication({ organizationId: 'org_a', ...a })) });
    const deps = createTestJobDeps({ jobs: createInMemoryJobRepository([job]), applicationCounts: createInMemoryApplicationCounts(store) });
    return { job, deps };
  };

  it('keeps given ids and assigns fresh unique ones to new stages', async () => {
    const { job, deps } = seeded();
    const updated = await updateJob(deps, actor, { jobId: job.id, content: withProcess([stage('stg-a'), stage(undefined), stage(undefined)]) });
    const ids = updated.content.process.map((s) => s.id);
    expect(ids[0]).toBe('stg-a');
    expect(ids.every((id) => id !== undefined && /^[a-z0-9-]{1,40}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(3);
  });

  it('rejects duplicate stage ids', async () => {
    const { job, deps } = seeded();
    const error = await updateJob(deps, actor, { jobId: job.id, content: withProcess([stage('dup'), stage('dup')]) }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues).toEqual([{ path: 'process', message: 'duplicate_stage_id:dup' }]);
  });

  it('allows reordering, renaming and adding stages even with open candidates', async () => {
    const { job, deps } = seededWithApplications([{ stageId: 'stg-a' }, { id: 'app_2', stageId: 'stg-b' }]);
    const content = withProcess([{ ...stage('stg-b', 'technical_interview'), title: 'Prova tecnica' } as never, stage('stg-a'), stage('stg-c', 'final_interview'), stage(undefined, 'offer')]);
    const updated = await updateJob(deps, actor, { jobId: job.id, content });
    expect(updated.content.process.map((s) => s.id).slice(0, 3)).toEqual(['stg-b', 'stg-a', 'stg-c']);
    expect(updated.content.process).toHaveLength(4);
  });

  it('refuses to drop a stage that has open applications, one issue per blocked stage', async () => {
    const { job, deps } = seededWithApplications([{ stageId: 'stg-a' }, { id: 'app_2', stageId: 'stg-c' }]);
    const error = await updateJob(deps, actor, { jobId: job.id, content: withProcess([stage('stg-b', 'technical_interview')]) }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues).toEqual([
      { path: 'process', message: 'stage_has_open_applications:stg-a' },
      { path: 'process', message: 'stage_has_open_applications:stg-c' },
    ]);
    expect(deps.auditLog.events()).toHaveLength(0);
    expect((await deps.jobs.findById('org_a', job.id))?.content.process).toHaveLength(3);
  });

  it('allows dropping a stage that has only decided applications', async () => {
    const { job, deps } = seededWithApplications([{ stageId: 'stg-a', outcome: 'not_selected', closedAt: new Date() }]);
    const updated = await updateJob(deps, actor, { jobId: job.id, content: withProcess([stage('stg-b', 'technical_interview'), stage('stg-c', 'final_interview')]) });
    expect(updated.content.process).toHaveLength(2);
  });

  it('ignores open applications of other organizations and jobs', async () => {
    const { job, deps } = seededWithApplications([
      { stageId: 'stg-a', organizationId: 'org_b' },
      { id: 'app_2', stageId: 'stg-a', jobId: 'other_job' },
    ]);
    await expect(updateJob(deps, actor, { jobId: job.id, content: withProcess([stage('stg-b', 'technical_interview')]) })).resolves.toBeDefined();
  });

  it('treats legacy stages without id as stage-<index> when comparing', async () => {
    const legacy = buildJob({ organizationId: 'org_a', status: 'published' });
    const store = createCandidateStore({ applications: [buildApplication({ organizationId: 'org_a', stageId: 'stage-1' })] });
    const deps = createTestJobDeps({ jobs: createInMemoryJobRepository([legacy]), applicationCounts: createInMemoryApplicationCounts(store) });
    const error = await updateJob(deps, actor, { jobId: legacy.id, content: withProcess([stage('x')]) }).catch((e: unknown) => e);
    expect((error as ValidationError).issues).toEqual([{ path: 'process', message: 'stage_has_open_applications:stage-1' }]);
  });
});
