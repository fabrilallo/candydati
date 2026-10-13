import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@tt/db';
import type { FeedbackRequest, InterviewFeedback, JobRequest, StageInterviewer } from '@tt/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError } from '../errors.js';
import { buildApplication, buildCandidate, buildJob } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleFeedbackRequests, createDrizzleInterviewFeedback, createDrizzleStageInterviewers } from './drizzle-feedback.js';
import { createDrizzleJobApprovals, createDrizzleJobRequests, createDrizzleOrganizationSettings, createDrizzleStaleJobs } from './drizzle-job-requests.js';
import { createDrizzleJobs } from './drizzle-jobs.js';

let handle: DbHandle;
const NOW = new Date('2026-06-01T00:00:00Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

async function insertOrg(): Promise<string> {
  const id = randomUUID();
  await handle.db.insert(schema.organization).values({ id, name: `Org ${id}`, slug: id, createdAt: new Date() });
  return id;
}

async function insertJob(org: string, overrides = {}): Promise<string> {
  const id = randomUUID();
  await createDrizzleJobs(handle.db).create(buildJob({ id, slug: id, organizationId: org, ...overrides }));
  return id;
}

async function insertApplication(org: string, jobId: string, overrides = {}): Promise<string> {
  const candidateId = randomUUID();
  await createDrizzleCandidates(handle.db).create(buildCandidate({ id: candidateId, organizationId: org, email: `${candidateId}@x.example` }));
  const id = randomUUID();
  await createDrizzleApplications(handle.db).create(buildApplication({ id, organizationId: org, jobId, candidateId, ...overrides }));
  return id;
}

const interviewer = (org: string, jobId: string, overrides: Partial<StageInterviewer> = {}): StageInterviewer => ({
  id: randomUUID(), organizationId: org, jobId, stageId: 'stage-1', kind: 'external', userId: null, email: 'e@x.example', name: 'Eva', createdAt: NOW, ...overrides,
});

const request = (org: string, jobId: string, applicationId: string, overrides: Partial<FeedbackRequest> = {}): FeedbackRequest => ({
  id: randomUUID(), organizationId: org, applicationId, jobId, stageId: 'stage-1', interviewerKind: 'external', interviewerUserId: null, interviewerEmail: 'e@x.example',
  interviewerName: 'Eva', tokenHash: randomUUID(), expiresAt: new Date(NOW.getTime() + 14 * DAY), remindersSent: 0, lastReminderAt: null, requestedBy: 'u', createdAt: NOW, submittedAt: null, ...overrides,
});

describe('stage interviewers on Postgres', () => {
  it('replaces the configuration of a job as a whole, per organization', async () => {
    const org = await insertOrg();
    const other = await insertOrg();
    const jobId = await insertJob(org);
    const otherJob = await insertJob(other);
    const repo = createDrizzleStageInterviewers(handle.db);
    await repo.replaceForJob(other, otherJob, [interviewer(other, otherJob)]);
    await repo.replaceForJob(org, jobId, [interviewer(org, jobId), interviewer(org, jobId, { stageId: 'stage-2', email: 'f@x.example' })]);
    expect(await repo.listByJob(org, jobId)).toHaveLength(2);
    expect(await repo.listByStage(org, jobId, 'stage-2')).toHaveLength(1);
    await repo.replaceForJob(org, jobId, [interviewer(org, jobId, { stageId: 'stage-3' })]);
    expect((await repo.listByJob(org, jobId)).map((i) => i.stageId)).toEqual(['stage-3']);
    expect(await repo.listByJob(org, otherJob)).toEqual([]);
    expect(await repo.listByJob(other, otherJob)).toHaveLength(1);
    await repo.replaceForJob(org, jobId, []);
    expect(await repo.listByJob(org, jobId)).toEqual([]);
  });
});

describe('feedback requests and feedback on Postgres', () => {
  it('stores requests by token hash, finds them across organizations by hash only, and refuses a repeated hash', async () => {
    const org = await insertOrg();
    const jobId = await insertJob(org);
    const applicationId = await insertApplication(org, jobId);
    const repo = createDrizzleFeedbackRequests(handle.db);
    const created = await repo.create(request(org, jobId, applicationId));
    expect(await repo.findByTokenHash(created.tokenHash)).toEqual(created);
    expect(await repo.findByTokenHash('missing')).toBeNull();
    expect(await repo.findById(org, created.id)).toEqual(created);
    expect(await repo.findById(await insertOrg(), created.id)).toBeNull();
    await expect(repo.create(request(org, jobId, applicationId, { tokenHash: created.tokenHash }))).rejects.toBeInstanceOf(ConflictError);
    const saved = await repo.rotateToken(org, created.id, created.tokenHash, { tokenHash: 'rotated', remindersSent: 1, lastReminderAt: NOW });
    expect(saved).toMatchObject({ tokenHash: 'rotated', remindersSent: 1, lastReminderAt: NOW });
    // Guarded on the link it replaces and on "still empty": a stale scan or a submitted request is left alone.
    expect(await repo.rotateToken(org, created.id, created.tokenHash, { tokenHash: 'again', remindersSent: 2, lastReminderAt: NOW })).toBeNull();
    expect(await repo.markSubmitted(org, created.id, NOW)).toBe(true);
    expect(await repo.markSubmitted(org, created.id, NOW)).toBe(false);
    expect(await repo.rotateToken(org, created.id, 'rotated', { tokenHash: 'late', remindersSent: 2, lastReminderAt: NOW })).toBeNull();
    expect(await repo.findById(org, created.id)).toMatchObject({ tokenHash: 'rotated', submittedAt: NOW });
    expect((await repo.listByApplication(org, applicationId)).map((r) => r.id)).toEqual([created.id]);
    expect(await repo.listByApplication(await insertOrg(), applicationId)).toEqual([]);
  });

  it('lists open requests across organizations: not submitted and not expired', async () => {
    const org = await insertOrg();
    const jobId = await insertJob(org);
    const applicationId = await insertApplication(org, jobId);
    const repo = createDrizzleFeedbackRequests(handle.db);
    const open = await repo.create(request(org, jobId, applicationId));
    const done = await repo.create(request(org, jobId, applicationId, { submittedAt: NOW }));
    const expired = await repo.create(request(org, jobId, applicationId, { expiresAt: ago(1) }));
    const ids = (await repo.listOpenAcrossOrganizations(NOW)).map((r) => r.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(done.id);
    expect(ids).not.toContain(expired.id);
  });

  it('keeps one feedback per request and lists them per application, per organization', async () => {
    const org = await insertOrg();
    const jobId = await insertJob(org);
    const applicationId = await insertApplication(org, jobId);
    const requests = createDrizzleFeedbackRequests(handle.db);
    const feedback = createDrizzleInterviewFeedback(handle.db);
    const req = await requests.create(request(org, jobId, applicationId));
    const value: InterviewFeedback = { id: randomUUID(), organizationId: org, applicationId, requestId: req.id, stageId: 'stage-1', interviewerName: 'Eva', answers: { tech_shown: 'ok' }, recommendation: 'discuss', submittedAt: NOW };
    expect(await feedback.create(value)).toEqual(value);
    await expect(feedback.create({ ...value, id: randomUUID() })).rejects.toBeInstanceOf(ConflictError);
    expect(await feedback.findByRequest(org, req.id)).toEqual(value);
    expect(await feedback.findByRequest(await insertOrg(), req.id)).toBeNull();
    expect(await feedback.listByApplication(org, applicationId)).toEqual([value]);
    expect(await feedback.listByApplication(await insertOrg(), applicationId)).toEqual([]);
  });
});

const jobRequest = (org: string, overrides: Partial<JobRequest> = {}): JobRequest => ({
  id: randomUUID(), organizationId: org, requestedBy: 'u', title: 'Dev', reason: 'r', headcount: 1, salaryMin: 1, salaryMax: 2, currency: 'EUR', location: {}, processNotes: '', interviewersNotes: '',
  language: 'it', status: 'submitted', decidedBy: null, decidedAt: null, decisionNote: null, jobId: null, createdAt: NOW, updatedAt: NOW, ...overrides,
});

describe('job requests, settings and approvals on Postgres', () => {
  it('round-trips a request with its optional fields, lists newest first with filters and isolates organizations', async () => {
    const org = await insertOrg();
    const repo = createDrizzleJobRequests(handle.db);
    const full = await repo.create(jobRequest(org, { role: 'backend_developer', seniority: 'senior', workMode: 'remote', desiredStart: '2026-09-01', location: { city: 'Milano' }, createdAt: ago(1) }));
    expect(full).toMatchObject({ role: 'backend_developer', desiredStart: '2026-09-01', location: { city: 'Milano' } });
    const bare = await repo.create(jobRequest(org));
    expect(bare).not.toHaveProperty('role');
    expect((await repo.list({ organizationId: org, page: 1, limit: 10 })).items.map((r) => r.id)).toEqual([bare.id, full.id]);
    const saved = await repo.save({ ...bare, status: 'rejected', decidedBy: 'a', decidedAt: NOW, decisionNote: 'no' });
    expect(saved).toMatchObject({ status: 'rejected', decisionNote: 'no' });
    expect(await repo.list({ organizationId: org, status: 'rejected', page: 1, limit: 10 })).toMatchObject({ total: 1 });
    expect((await repo.list({ organizationId: org, page: 2, limit: 1 })).items).toHaveLength(1);
    expect(await repo.findById(await insertOrg(), full.id)).toBeNull();
    expect((await repo.list({ organizationId: await insertOrg(), page: 1, limit: 10 })).total).toBe(0);
  });

  it('finds the open request of a draft', async () => {
    const org = await insertOrg();
    const jobId = await insertJob(org, { status: 'draft' });
    const repo = createDrizzleJobRequests(handle.db);
    expect(await repo.findOpenForJob(org, jobId)).toBeNull();
    const created = await repo.create(jobRequest(org, { jobId }));
    expect((await repo.findOpenForJob(org, jobId))?.id).toBe(created.id);
    await repo.save({ ...created, status: 'converted' });
    expect(await repo.findOpenForJob(org, jobId)).toBeNull();
  });

  it('keeps the approval setting per organization, off by default', async () => {
    const org = await insertOrg();
    const repo = createDrizzleOrganizationSettings(handle.db);
    expect(await repo.get(org)).toEqual({ requireApproval: false });
    expect(await repo.setRequireApproval(org, true, NOW)).toEqual({ requireApproval: true });
    expect(await repo.setRequireApproval(org, true, NOW)).toEqual({ requireApproval: true });
    expect(await repo.get(org)).toEqual({ requireApproval: true });
    expect(await repo.get(await insertOrg())).toEqual({ requireApproval: false });
    expect(await repo.setRequireApproval(org, false, NOW)).toEqual({ requireApproval: false });
  });

  it('stores the approval apart from the job: editing the job neither wipes nor forges it', async () => {
    const org = await insertOrg();
    const other = await insertOrg();
    const jobId = await insertJob(org);
    const approvals = createDrizzleJobApprovals(handle.db);
    const jobs = createDrizzleJobs(handle.db);
    expect(await approvals.find(org, jobId)).toBeNull();
    const approval = { approvedBy: 'admin', approvedAt: NOW, salaryMin: 40000, salaryMax: 50000, currency: 'EUR' as const };
    await approvals.set(org, jobId, approval);
    expect(await approvals.find(org, jobId)).toEqual(approval);
    await approvals.set(other, jobId, { ...approval, salaryMax: 1 });
    expect(await approvals.find(org, jobId)).toEqual(approval);
    const job = (await jobs.findById(org, jobId))!;
    await jobs.updateContent(org, jobId, job.status, { content: job.content, updatedAt: new Date(NOW.getTime() + 1000) });
    expect(await approvals.find(org, jobId)).toEqual(approval);
    await approvals.set(org, jobId, { ...approval, salaryMax: 60000 });
    expect((await approvals.find(org, jobId))?.salaryMax).toBe(60000);
  });
});

describe('stale jobs on Postgres', () => {
  it('uses the latest of publication, update, application, move and decision, per organization', async () => {
    const org = await insertOrg();
    const other = await insertOrg();
    const published = (overrides = {}) => ({ status: 'published' as const, publishedAt: ago(200), updatedAt: ago(200), ...overrides });
    const idle = await insertJob(org, published());
    const edited = await insertJob(org, published({ updatedAt: ago(10) }));
    const fresh = await insertJob(org, published({ publishedAt: ago(5), updatedAt: ago(5) }));
    const received = await insertJob(org, published());
    const moved = await insertJob(org, published());
    const decided = await insertJob(org, published());
    const draft = await insertJob(org, { status: 'draft', publishedAt: null, updatedAt: ago(300) });
    const foreign = await insertJob(other, published());
    await insertApplication(org, received, { createdAt: ago(4), stageChangedAt: ago(4) });
    await insertApplication(org, moved, { createdAt: ago(200), stageChangedAt: ago(6) });
    await insertApplication(org, decided, { createdAt: ago(200), stageChangedAt: ago(200), outcome: 'not_selected', closedAt: ago(2) });
    await insertApplication(org, idle, { createdAt: ago(150), stageChangedAt: ago(150) });
    const repo = createDrizzleStaleJobs(handle.db);
    const mine = await repo.listStale(ago(90), org);
    expect(mine.map((s) => s.job.id)).toEqual([idle]);
    expect(mine[0]?.lastActivityAt).toEqual(ago(150));
    const everywhere = (await repo.listStale(ago(90))).map((s) => s.job.id);
    expect(everywhere).toEqual(expect.arrayContaining([idle, foreign]));
    for (const not of [edited, fresh, received, moved, decided, draft]) expect(everywhere).not.toContain(not);
    expect((await repo.listStale(ago(90), other)).map((s) => s.job.id)).toEqual([foreign]);
  });
});
