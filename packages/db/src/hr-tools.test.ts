import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, runMigrations, type DbHandle } from './index.js';
import {
  application,
  candidate,
  feedbackRequest,
  interviewFeedback,
  job,
  jobRequest,
  jobStageInterviewer,
  organization,
  organizationSetting,
} from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

const url = testDatabaseUrl();
let handle: DbHandle;
const NOW = new Date('2026-06-01T00:00:00Z');
const consent = { privacyNoticeId: 'n', privacyNoticeVersion: 1, scopes: ['selection'], givenAt: NOW } as never;

async function world() {
  const org = randomUUID();
  await handle.db.insert(organization).values({ id: org, name: org, slug: org, createdAt: new Date() });
  const jobId = randomUUID();
  await handle.db.insert(job).values({ id: jobId, organizationId: org, slug: jobId, title: 'T', content: {} as never, createdBy: 'u' });
  const candidateId = randomUUID();
  await handle.db.insert(candidate).values({ id: candidateId, organizationId: org, firstName: 'A', lastName: 'B', email: `${candidateId}@x.it`, retentionExpiresAt: NOW });
  const applicationId = randomUUID();
  await handle.db.insert(application).values({
    id: applicationId, organizationId: org, jobId, candidateId, stageId: 'received', cvKey: 'k', cvFileName: 'cv.pdf', cvMediaType: 'application/pdf', cvSizeBytes: 1, consent, retentionExpiresAt: NOW, source: 'careers_page',
  });
  return { org, jobId, applicationId };
}

const request = (w: Awaited<ReturnType<typeof world>>, tokenHash: string) => ({
  id: randomUUID(), organizationId: w.org, applicationId: w.applicationId, jobId: w.jobId, stageId: 'stg-1', interviewerKind: 'external' as const,
  interviewerEmail: 'ext@x.it', interviewerName: 'Ext', tokenHash, expiresAt: NOW, requestedBy: 'u',
});

describe('phase 9 tables', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('keeps one feedback request per token hash and defaults the reminders', async () => {
    const w = await world();
    const hash = randomUUID();
    await handle.db.insert(feedbackRequest).values(request(w, hash));
    const [row] = await handle.db.select().from(feedbackRequest).where(eq(feedbackRequest.tokenHash, hash));
    expect(row).toMatchObject({ remindersSent: 0, lastReminderAt: null, submittedAt: null });
    await expect(handle.db.insert(feedbackRequest).values(request(w, hash))).rejects.toThrow();
  });

  it('allows one feedback per request and has no score column', async () => {
    const w = await world();
    const req = request(w, randomUUID());
    await handle.db.insert(feedbackRequest).values(req);
    const value = { id: randomUUID(), organizationId: w.org, applicationId: w.applicationId, requestId: req.id, stageId: 'stg-1', interviewerName: 'Ext', answers: { a: 'b' }, recommendation: 'discuss' as const, submittedAt: NOW };
    await handle.db.insert(interviewFeedback).values(value);
    await expect(handle.db.insert(interviewFeedback).values({ ...value, id: randomUUID() })).rejects.toThrow();
    const { rows } = await handle.pool.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'interview_feedback'`);
    expect(rows.map((r) => r.column_name).filter((name) => /score|rating|vote/.test(name))).toEqual([]);
  });

  it('refuses to delete an application that still has feedback requests', async () => {
    const w = await world();
    await handle.db.insert(feedbackRequest).values(request(w, randomUUID()));
    await expect(handle.db.delete(application).where(eq(application.id, w.applicationId))).rejects.toThrow();
  });

  it('stores interviewers, job requests and settings with their defaults', async () => {
    const w = await world();
    await handle.db.insert(jobStageInterviewer).values({ id: randomUUID(), organizationId: w.org, jobId: w.jobId, stageId: 'stg-1', kind: 'member', userId: 'u1', name: 'Ada' });
    const requestId = randomUUID();
    await handle.db.insert(jobRequest).values({ id: requestId, organizationId: w.org, requestedBy: 'u', title: 'T', reason: 'r', salaryMin: 1, salaryMax: 2, currency: 'EUR', location: {}, language: 'it' });
    const [row] = await handle.db.select().from(jobRequest).where(eq(jobRequest.id, requestId));
    expect(row).toMatchObject({ status: 'submitted', headcount: 1, jobId: null, decidedAt: null, processNotes: '' });
    await handle.db.insert(organizationSetting).values({ organizationId: w.org });
    const [setting] = await handle.db.select().from(organizationSetting).where(eq(organizationSetting.organizationId, w.org));
    expect(setting?.requireApproval).toBe(false);
    const [jobRow] = await handle.db.select().from(job).where(eq(job.id, w.jobId));
    expect(jobRow).toMatchObject({ approvalApprovedBy: null, approvalSalaryMax: null });
  });
});
