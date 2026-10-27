import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { apiKeyActor, agentActor, buildJob, completeJobContent, ORG_A, ORG_B, seedHrWorld, userActor, type TestHrDeps } from '../../testing/index.js';
import { publishJob } from '../jobs/publish-job.js';
import { getApprovalSetting, getJobApprovalStatus, setApprovalSetting } from './approval-setting.js';
import { approveJobRequest, convertJobRequest, rejectJobRequest } from './decisions.js';
import { getJobRequest, listJobRequests, requestJobApproval, submitJobRequest } from './requests.js';

const owner = userActor({ id: 'user_test', role: 'owner', organizationId: ORG_A });
const admin = userActor({ id: 'admin_1', role: 'admin', organizationId: ORG_A });
const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const hm = userActor({ id: 'hm_1', role: 'hiring_manager', organizationId: ORG_A });
const interviewer = userActor({ id: 'i_1', role: 'interviewer', organizationId: ORG_A });
const REQUEST = { title: 'Senior Backend Developer', reason: 'The team grows', salaryMin: 45000, salaryMax: 55000, role: 'backend_developer', seniority: 'senior', workMode: 'remote' };

const world = (): TestHrDeps => seedHrWorld();
const withApproval = async (deps: TestHrDeps, on = true) => {
  await setApprovalSetting(deps, owner, { requireApproval: on });
  return deps;
};
const draft = async (deps: TestHrDeps, id: string, salary = { min: 40000, max: 50000, currency: 'EUR', period: 'year' }) => {
  // Written directly, so the creator joins the team here (createJob does it itself).
  await deps.jobTeams.addIfAbsent({ organizationId: ORG_A, jobId: id, userId: 'hm_1', role: 'hiring_manager', addedBy: 'system', createdAt: new Date() });
  return deps.jobs.create(buildJob({ id, slug: id, organizationId: ORG_A, status: 'draft', createdBy: 'hm_1', content: completeJobContent({ title: 'Platform Engineer', salary: salary as never }) }));
};
const issuesOf = async (promise: Promise<unknown>) => ((await promise.catch((e: unknown) => e)) as ValidationError).issues;

describe('submitJobRequest', () => {
  it('stores the request, audits it and notifies owners and admins but not the requester', async () => {
    const deps = world();
    const request = await submitJobRequest(deps, hm, REQUEST);
    expect(request).toMatchObject({ status: 'submitted', requestedBy: 'hm_1', headcount: 1, currency: 'EUR', jobId: null, decidedBy: null, organizationId: ORG_A });
    expect(deps.auditLog.events().map((e) => e.action)).toEqual(['job_request.submitted']);
    expect(deps.notifications.snapshot().map((n) => [n.userId, n.kind, n.payload])).toEqual([
      ['user_test', 'job_request_submitted', { requestId: request.id, status: 'submitted' }],
      ['admin_1', 'job_request_submitted', { requestId: request.id, status: 'submitted' }],
    ]);
  });

  it('does not notify an approver who made the request themselves', async () => {
    const deps = world();
    await submitJobRequest(deps, owner, REQUEST);
    expect(deps.notifications.snapshot().map((n) => n.userId)).toEqual(['admin_1']);
  });

  it('is open to anyone with job:create, never to an interviewer', async () => {
    for (const actor of [owner, admin, recruiter, hm]) await expect(submitJobRequest(world(), actor, REQUEST)).resolves.toBeDefined();
    await expect(submitJobRequest(world(), interviewer, REQUEST)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('validates the budget and the reason', async () => {
    const deps = world();
    await expect(submitJobRequest(deps, hm, { ...REQUEST, salaryMax: 10 })).rejects.toBeInstanceOf(ValidationError);
    await expect(submitJobRequest(deps, hm, { ...REQUEST, reason: '' })).rejects.toBeInstanceOf(ValidationError);
    await expect(submitJobRequest(deps, hm, { ...REQUEST, headcount: 0 })).rejects.toBeInstanceOf(ValidationError);
    expect(deps.jobRequests.snapshot()).toHaveLength(0);
  });

  it('accepts a custom role with its text and refuses it without', async () => {
    const deps = world();
    const stored = await submitJobRequest(deps, hm, { ...REQUEST, role: 'other', customRole: ' Pastry chef ' });
    expect(stored).toMatchObject({ role: 'other', customRole: 'Pastry chef' });
    await expect(submitJobRequest(deps, hm, { ...REQUEST, role: 'other' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('survives a failing notification', async () => {
    const deps = world();
    const broken = { ...deps, members: { list: async () => Promise.reject(new Error('down')) } };
    await expect(submitJobRequest(broken, hm, REQUEST)).resolves.toBeDefined();
  });
});

describe('list and get', () => {
  it('lists newest first with a status filter, for everyone who reads jobs, within the organization', async () => {
    const deps = world();
    const first = await submitJobRequest(deps, hm, REQUEST);
    const later = { ...deps, now: () => new Date('2026-06-02T00:00:00Z'), newId: () => 'second' };
    await submitJobRequest(later, hm, REQUEST);
    await rejectJobRequest(deps, owner, { requestId: first.id, note: 'No budget' });
    const all = await listJobRequests(deps, interviewer, {});
    expect(all.items.map((r) => r.id)).toEqual(['second', first.id]);
    expect((await listJobRequests(deps, hm, { status: 'rejected' })).items.map((r) => r.id)).toEqual([first.id]);
    expect((await listJobRequests(deps, hm, { page: 2, limit: 1 })).items.map((r) => r.id)).toEqual([first.id]);
    expect((await listJobRequests(deps, userActor({ role: 'owner', organizationId: ORG_B }), {})).meta).toEqual({ total: 0, page: 1, limit: 20 });
    expect((await listJobRequests(deps, hm, { page: 2, limit: 1 })).meta).toMatchObject({ page: 2, limit: 1 });
  });

  it('gets one request, and another organization does not see it', async () => {
    const deps = world();
    const request = await submitJobRequest(deps, hm, REQUEST);
    expect((await getJobRequest(deps, interviewer, { requestId: request.id })).title).toBe(REQUEST.title);
    await expect(getJobRequest(deps, userActor({ role: 'owner', organizationId: ORG_B }), { requestId: request.id })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('approve and reject', () => {
  it('approves, notifies the requester and audits', async () => {
    const deps = world();
    const request = await submitJobRequest(deps, hm, REQUEST);
    const done = await approveJobRequest(deps, admin, { requestId: request.id, note: 'Ok' });
    expect(done).toMatchObject({ status: 'approved', decidedBy: 'admin_1', decisionNote: 'Ok' });
    expect(deps.notifications.snapshot().filter((n) => n.kind === 'job_request_decided').map((n) => [n.userId, n.payload.status])).toEqual([['hm_1', 'approved']]);
    expect(deps.auditLog.events().map((e) => e.action)).toContain('job_request.approved');
  });

  it('only owners and admins decide; recruiters, managers, interviewers and machines do not', async () => {
    const deps = world();
    const request = await submitJobRequest(deps, hm, REQUEST);
    for (const actor of [recruiter, hm, interviewer, apiKeyActor({ organizationId: ORG_A }), agentActor({ organizationId: ORG_A })]) {
      await expect(approveJobRequest(deps, actor, { requestId: request.id })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(rejectJobRequest(deps, actor, { requestId: request.id, note: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(approveJobRequest(deps, userActor({ role: 'owner', organizationId: ORG_B }), { requestId: request.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects with a mandatory note and notifies the requester', async () => {
    const deps = world();
    const request = await submitJobRequest(deps, hm, REQUEST);
    await expect(rejectJobRequest(deps, owner, { requestId: request.id, note: '  ' })).rejects.toBeInstanceOf(ValidationError);
    expect(await rejectJobRequest(deps, owner, { requestId: request.id, note: 'Hiring freeze' })).toMatchObject({ status: 'rejected', decisionNote: 'Hiring freeze' });
    expect(deps.notifications.snapshot().some((n) => n.kind === 'job_request_decided' && n.userId === 'hm_1')).toBe(true);
    expect(deps.auditLog.events().map((e) => e.action)).toContain('job_request.rejected');
  });

  it('decides only once', async () => {
    const deps = world();
    const request = await submitJobRequest(deps, hm, REQUEST);
    await approveJobRequest(deps, owner, { requestId: request.id });
    await expect(approveJobRequest(deps, owner, { requestId: request.id })).rejects.toBeInstanceOf(ConflictError);
    await expect(rejectJobRequest(deps, owner, { requestId: request.id, note: 'late' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('does not notify the requester about a decision they made themselves', async () => {
    const deps = world();
    const request = await submitJobRequest(deps, owner, REQUEST);
    await approveJobRequest(deps, owner, { requestId: request.id });
    expect(deps.notifications.snapshot().filter((n) => n.kind === 'job_request_decided')).toEqual([]);
  });
});

describe('convertJobRequest', () => {
  it('with approval on, only an approved request becomes a draft that carries the approval and belongs to the requester', async () => {
    const deps = await withApproval(world());
    const request = await submitJobRequest(deps, hm, REQUEST);
    expect(await issuesOf(convertJobRequest(deps, hm, { requestId: request.id }))).toEqual([{ path: 'status', message: 'approval_required' }]);
    await approveJobRequest(deps, owner, { requestId: request.id });
    const job = await convertJobRequest(deps, hm, { requestId: request.id });
    expect(job).toMatchObject({ status: 'draft', createdBy: 'hm_1', content: { title: REQUEST.title, role: 'backend_developer', workMode: 'remote', salary: { min: 45000, max: 55000, currency: 'EUR', period: 'year' } } });
    expect(await deps.approvals.find(ORG_A, job.id)).toMatchObject({ approvedBy: 'user_test', salaryMin: 45000, salaryMax: 55000, currency: 'EUR' });
    expect(await getJobRequest(deps, hm, { requestId: request.id })).toMatchObject({ status: 'converted', jobId: job.id });
    expect(deps.auditLog.events().map((e) => e.action)).toEqual(expect.arrayContaining(['job_request.converted', 'job.created']));
  });

  it('with approval off, converts at once and the job has no approval', async () => {
    const deps = world();
    const request = await submitJobRequest(deps, hm, REQUEST);
    const job = await convertJobRequest(deps, hm, { requestId: request.id });
    expect(job.status).toBe('draft');
    expect(await deps.approvals.find(ORG_A, job.id)).toBeNull();
  });

  it('refuses a rejected, converted or draft-linked request and an interviewer', async () => {
    const deps = world();
    const rejected = await submitJobRequest(deps, hm, REQUEST);
    await rejectJobRequest(deps, owner, { requestId: rejected.id, note: 'no' });
    await expect(convertJobRequest(deps, hm, { requestId: rejected.id })).rejects.toBeInstanceOf(ConflictError);
    const done = await submitJobRequest(deps, hm, REQUEST);
    await convertJobRequest(deps, hm, { requestId: done.id });
    await expect(convertJobRequest(deps, hm, { requestId: done.id })).rejects.toBeInstanceOf(ConflictError);
    await expect(convertJobRequest(deps, interviewer, { requestId: done.id })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(convertJobRequest(deps, userActor({ role: 'owner', organizationId: ORG_B }), { requestId: done.id })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('approval setting', () => {
  it('is off by default, can be switched by owners and admins only, and is audited', async () => {
    const deps = world();
    expect(await getApprovalSetting(deps, hm, {})).toEqual({ requireApproval: false });
    await expect(setApprovalSetting(deps, recruiter, { requireApproval: true })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setApprovalSetting(deps, apiKeyActor({ organizationId: ORG_A }), { requireApproval: true })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await setApprovalSetting(deps, admin, { requireApproval: true })).toEqual({ requireApproval: true });
    expect(await getApprovalSetting(deps, hm, {})).toEqual({ requireApproval: true });
    expect(await getApprovalSetting(deps, userActor({ role: 'owner', organizationId: ORG_B }), {})).toEqual({ requireApproval: false });
    expect(deps.auditLog.events().at(-1)).toMatchObject({ action: 'organization.approval_setting_updated', metadata: { requireApproval: true } });
  });
});

describe('publishJob and approval', () => {
  it('refuses with approval_required when approval is on and the job has none, and says so in the status', async () => {
    const deps = await withApproval(world());
    await draft(deps, 'job_d');
    expect(await issuesOf(publishJob(deps, owner, { jobId: 'job_d' }))).toEqual([{ path: 'approval', message: 'approval_required' }]);
    expect(await getJobApprovalStatus(deps, hm, { jobId: 'job_d' })).toEqual({ requireApproval: true, approval: null, publishable: false });
  });

  it('refuses with approval_range_exceeded when the salary goes beyond the approved maximum or currency', async () => {
    const deps = await withApproval(world());
    await draft(deps, 'job_d', { min: 40000, max: 60000, currency: 'EUR', period: 'year' });
    await deps.approvals.set(ORG_A, 'job_d', { approvedBy: 'user_test', approvedAt: new Date(), salaryMin: 40000, salaryMax: 50000, currency: 'EUR' });
    expect(await issuesOf(publishJob(deps, owner, { jobId: 'job_d' }))).toEqual([{ path: 'approval', message: 'approval_range_exceeded' }]);
    await draft(deps, 'job_e', { min: 40000, max: 45000, currency: 'USD', period: 'year' });
    await deps.approvals.set(ORG_A, 'job_e', { approvedBy: 'user_test', approvedAt: new Date(), salaryMin: 40000, salaryMax: 50000, currency: 'EUR' });
    expect(await issuesOf(publishJob(deps, owner, { jobId: 'job_e' }))).toEqual([{ path: 'approval', message: 'approval_range_exceeded' }]);
  });

  it('publishes inside the approved range, at the limit included, and keeps the other rules', async () => {
    const deps = await withApproval(world());
    await draft(deps, 'job_d', { min: 45000, max: 50000, currency: 'EUR', period: 'year' });
    await deps.approvals.set(ORG_A, 'job_d', { approvedBy: 'user_test', approvedAt: new Date(), salaryMin: 40000, salaryMax: 50000, currency: 'EUR' });
    expect((await publishJob(deps, owner, { jobId: 'job_d' })).job.status).toBe('published');
    await deps.jobs.create(buildJob({ id: 'job_x', slug: 'x', organizationId: ORG_A, status: 'draft', content: completeJobContent({ title: 'Broken', responsibilities: [] }) }));
    await deps.approvals.set(ORG_A, 'job_x', { approvedBy: 'u', approvedAt: new Date(), salaryMin: 1, salaryMax: 999999, currency: 'EUR' });
    const issues = await issuesOf(publishJob(deps, owner, { jobId: 'job_x' }));
    expect(issues.map((i) => i.message)).toEqual(['too_few_responsibilities']);
  });

  it('does not ask for approval when the organization does not require it', async () => {
    const deps = world();
    await draft(deps, 'job_d');
    expect((await publishJob(deps, owner, { jobId: 'job_d' })).job.status).toBe('published');
    await withApproval(deps, true);
    await withApproval(deps, false);
    await draft(deps, 'job_e');
    expect((await publishJob(deps, owner, { jobId: 'job_e' })).job.status).toBe('published');
  });

  it('an approval of one organization means nothing in another', async () => {
    const deps = await withApproval(world());
    await draft(deps, 'job_d');
    await deps.approvals.set(ORG_B, 'job_d', { approvedBy: 'u', approvedAt: new Date(), salaryMin: 1, salaryMax: 999999, currency: 'EUR' });
    expect(await issuesOf(publishJob(deps, owner, { jobId: 'job_d' }))).toEqual([{ path: 'approval', message: 'approval_required' }]);
  });
});

describe('asking approval for a draft written directly', () => {
  it('links the request to the job, and approving it puts the approval on the job so it can be published', async () => {
    const deps = await withApproval(world());
    await draft(deps, 'job_d');
    const request = await requestJobApproval(deps, hm, { jobId: 'job_d', reason: 'Replacement' });
    expect(request).toMatchObject({ jobId: 'job_d', status: 'submitted', salaryMin: 40000, salaryMax: 50000, requestedBy: 'hm_1' });
    await expect(requestJobApproval(deps, hm, { jobId: 'job_d', reason: 'again' })).rejects.toBeInstanceOf(ConflictError);
    expect(deps.notifications.snapshot().filter((n) => n.kind === 'job_request_submitted')).toHaveLength(2);
    expect(await approveJobRequest(deps, owner, { requestId: request.id })).toMatchObject({ status: 'converted', jobId: 'job_d' });
    expect(await getJobApprovalStatus(deps, hm, { jobId: 'job_d' })).toMatchObject({ publishable: true, approval: { salaryMax: 50000 } });
    expect((await publishJob(deps, owner, { jobId: 'job_d' })).job.status).toBe('published');
  });

  it('a rejection leaves the job without approval', async () => {
    const deps = await withApproval(world());
    await draft(deps, 'job_d');
    const request = await requestJobApproval(deps, hm, { jobId: 'job_d', reason: 'Replacement' });
    await rejectJobRequest(deps, owner, { requestId: request.id, note: 'No' });
    expect(await issuesOf(publishJob(deps, owner, { jobId: 'job_d' }))).toEqual([{ path: 'approval', message: 'approval_required' }]);
  });

  it('needs a draft with a salary range, and an existing job of the organization', async () => {
    const deps = world();
    for (const jobId of ['job_1', 'job_n']) await deps.jobTeams.upsert({ organizationId: ORG_A, jobId, userId: 'hm_1', role: 'hiring_manager', addedBy: 'system', createdAt: new Date() });
    await expect(requestJobApproval(deps, hm, { jobId: 'job_1', reason: 'x' })).rejects.toBeInstanceOf(ConflictError);
    await deps.jobs.create(buildJob({ id: 'job_n', slug: 'n', organizationId: ORG_A, status: 'draft', content: completeJobContent({ title: 'No range', salary: { currency: 'EUR', period: 'year' } }) }));
    await expect(requestJobApproval(deps, hm, { jobId: 'job_n', reason: 'x' })).rejects.toBeInstanceOf(ValidationError);
    await expect(requestJobApproval(deps, userActor({ role: 'owner', organizationId: ORG_B }), { jobId: 'job_n', reason: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(requestJobApproval(deps, interviewer, { jobId: 'job_n', reason: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
