import type { Employment } from '@candydati/domain';
import { randomUUID } from 'node:crypto';
import { createDrizzleJobs, createDrizzleJobTeams, createDrizzleMemberDirectory, createDrizzleNotifications, createDrizzleStaleJobs, scanStaleJobs } from '@candydati/core';
import { completeJobContent } from '@candydati/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey, withKey } from './testing/api-keys.js';
import { publishJob, type World } from './testing/candidate-world.js';
import { applyAs, auditMentions, createWorld, leftovers } from './testing/privacy-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

interface Issue {
  path: string;
  message: string;
}
const issuesOf = (reply: { body: { error: unknown } }): Issue[] => (reply.body.error as { issues: Issue[] }).issues;
const anonymous = (method: 'GET' | 'POST', url: string, payload?: object) => t.app.inject({ method, url, ...(payload ? { payload } : {}) });
const tokenFromMail = (to: string): string => {
  const mail = t.emailSender.sent().filter((m) => m.to === to).at(-1);
  const match = /\/feedback\/([a-z0-9]+)/.exec(mail?.text ?? '');
  if (!match) throw new Error(`no feedback link sent to ${to}`);
  return match[1]!;
};
const uniqueMail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@example.com`;

describe('compliance blocks publication', () => {
  it('refuses a masculine-only title with the compliance issue and the detail, and publishes once it addresses both sexes', async () => {
    const w = await createWorld(t);
    const created = await w.owner.post<{ id: string }>('/api/v1/jobs', { content: completeJobContent({ title: 'Sviluppatore Backend' }) });
    const id = created.body.data!.id;

    const refused = await w.owner.post(`/api/v1/jobs/${id}/publish`);
    expect(refused.status).toBe(422);
    expect(issuesOf(refused)).toContainEqual({ path: 'title', message: 'gender_exclusive_title' });

    const job = await w.owner.get<{ publishIssues: { path: string; rule: string; detail?: { match: string; suggestion: string } }[] }>(`/api/v1/jobs/${id}`);
    const issue = job.body.data!.publishIssues.find((i) => i.rule === 'gender_exclusive_title');
    expect(issue).toMatchObject({ path: 'title', detail: { match: expect.stringContaining('Sviluppatore'), suggestion: expect.any(String) } });

    const fixed = await w.owner.put(`/api/v1/jobs/${id}`, { content: completeJobContent({ title: 'Sviluppatore/trice Backend' }) });
    expect(fixed.status).toBe(200);
    expect((await w.owner.post(`/api/v1/jobs/${id}/publish`)).status).toBe(200);
  });

  it('returns the doubtful findings as warnings, without blocking, and from the quality endpoint too', async () => {
    const w = await createWorld(t);
    const content = completeJobContent({ title: 'Sviluppatore/trice Backend', summary: 'Cerchiamo un neolaureato curioso.' });
    const analyzed = await w.owner.post<{ complianceWarnings: { rule: string }[]; publishIssues: unknown[] }>('/api/v1/jobs/quality', { content });
    expect(analyzed.body.data!.complianceWarnings.map((x) => x.rule)).toContain('age_proxy');
    const created = await w.owner.post<{ id: string; complianceWarnings: { rule: string }[] }>('/api/v1/jobs', { content });
    expect(created.body.data!.complianceWarnings.map((x) => x.rule)).toContain('age_proxy');
    expect((await w.owner.post(`/api/v1/jobs/${created.body.data!.id}/publish`)).status).toBe(200);
  });
});

describe('employment terms', () => {
  it('round-trip through the job and appear in the public feed', async () => {
    const w = await createWorld(t);
    const employment: Employment = {
      ccnl: 'commercio_terziario',
      level: '4° livello',
      monthlyPayments: 14,
      mealVoucher: { amountPerDay: 8, type: 'electronic' },
      welfareAnnual: 1000,
      bonus: 'Premio di risultato',
      extraBenefits: ['health_insurance', 'gym'],
    };
    const created = await w.owner.post<{ id: string; slug: string }>('/api/v1/jobs', { content: completeJobContent({ title: 'Impiegato/a amministrativo/a', employment }) });
    const { id, slug } = created.body.data!;
    expect((await w.owner.get<{ content: { employment: unknown } }>(`/api/v1/jobs/${id}`)).body.data!.content.employment).toEqual(employment);
    expect((await w.owner.post(`/api/v1/jobs/${id}/publish`)).status).toBe(200);
    const feed = await anonymous('GET', `/api/v1/public/organizations/${w.slug}/feed`);
    const published = (feed.json().data as { jobs: { slug: string; content: { employment: unknown } }[] }).jobs.find((j) => j.slug === slug);
    expect(published?.content.employment).toEqual(employment);
    const rejected = await w.owner.put(`/api/v1/jobs/${id}`, { content: { ...completeJobContent({ title: 'Impiegato/a amministrativo/a' }), employment: { ...employment, monthlyPayments: 20 } } });
    expect(rejected.status).toBe(422);
  });
});

interface Stage {
  id: string;
  declared: string | null;
}
interface PublicForm {
  organizationName: string;
  candidate: Record<string, unknown>;
  jobTitle: string;
  stage: { label: string; note: string | null };
  questions: { id: string }[];
  recommendations: string[];
  hasCv: boolean;
  submission: unknown;
}

async function declaredStage(w: World): Promise<string> {
  const board = await w.owner.get<{ stages: Stage[] }>(`/api/v1/jobs/${w.job.id}/pipeline`);
  return board.body.data!.stages.find((s) => s.declared !== null)!.id;
}

describe('interview feedback without login', () => {
  it('asks the interviewer on stage entry, shows the minimum on the public page, accepts one submission and shows it to the recruiter', async () => {
    const w = await createWorld(t);
    const stageId = await declaredStage(w);
    const email = uniqueMail('paolo');
    const set = await w.owner.put(`/api/v1/jobs/${w.job.id}/interviewers`, { stages: [{ stageId, interviewers: [{ kind: 'external', name: 'Paolo Test', email }] }] });
    expect(set.status).toBe(200);
    expect((await w.owner.get<{ stageId: string }[]>(`/api/v1/jobs/${w.job.id}/interviewers`)).body.data).toHaveLength(1);

    const applied = await applyAs(w);
    expect((await w.owner.post(`/api/v1/applications/${applied.applicationId}/move`, { stageId })).status).toBe(200);
    const mails = t.emailSender.sent().filter((m) => m.to === email);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.text).toContain(applied.person.lastName);
    const token = tokenFromMail(email);

    const page = await anonymous('GET', `/api/v1/public/feedback/${token}`);
    expect(page.statusCode).toBe(200);
    expect(page.headers['cache-control']).toBe('no-store');
    const form = page.json().data as PublicForm;
    expect(form.candidate).toEqual({ firstName: applied.person.firstName, lastName: applied.person.lastName });
    expect(JSON.stringify(form)).not.toContain(applied.person.email);
    expect(form.hasCv).toBe(true);
    expect(form.submission).toBeNull();
    expect(form.recommendations).toEqual(['proceed', 'do_not_proceed', 'discuss']);
    expect(Object.keys(form).toSorted()).toEqual(
      ['expiresAt', 'hasCv', 'interviewerName', 'jobTitle', 'language', 'organizationName', 'questions', 'recommendations', 'stage', 'submission', 'candidate'].toSorted(),
    );

    const cv = await anonymous('GET', `/api/v1/public/feedback/${token}/cv`);
    expect(cv.statusCode).toBe(200);
    expect(cv.headers['content-type']).toBe('application/pdf');
    expect(cv.headers['content-disposition']).toMatch(/^inline/);
    expect(cv.headers['content-security-policy']).toBe('sandbox');
    expect(cv.headers['x-content-type-options']).toBe('nosniff');
    expect(cv.headers['cache-control']).toBe('no-store');

    const answers = Object.fromEntries(form.questions.map((q) => [q.id, `Risposta ${q.id}`]));
    const withScore = await anonymous('POST', `/api/v1/public/feedback/${token}`, { answers, recommendation: 'proceed', score: 9 });
    expect(withScore.statusCode).toBe(422);
    const submitted = await anonymous('POST', `/api/v1/public/feedback/${token}`, { answers, recommendation: 'proceed' });
    expect(submitted.statusCode).toBe(200);

    const shown = await w.owner.get<{ feedback: { interviewerName: string; recommendation: string; answers: { answer: string }[] }[]; requests: { status: string }[] }>(
      `/api/v1/applications/${applied.applicationId}/feedback`,
    );
    expect(shown.body.data!.requests.map((r) => r.status)).toEqual(['submitted']);
    expect(shown.body.data!.feedback).toHaveLength(1);
    expect(shown.body.data!.feedback[0]).toMatchObject({ interviewerName: 'Paolo Test', recommendation: 'proceed' });
    expect(shown.body.data!.feedback[0]!.answers.length).toBeGreaterThan(0);

    const again = await anonymous('POST', `/api/v1/public/feedback/${token}`, { answers, recommendation: 'discuss' });
    expect(again.statusCode).toBe(409);
    expect((await anonymous('GET', `/api/v1/public/feedback/${token}`)).json().data.submission).toMatchObject({ recommendation: 'proceed' });
    expect((await anonymous('GET', '/api/v1/public/feedback/not-a-real-token-at-all-0000')).statusCode).toBe(404);
  });

  it('answers 404 once the link has expired', async () => {
    const w = await createWorld(t);
    const stageId = await declaredStage(w);
    const email = uniqueMail('expiring');
    await w.owner.put(`/api/v1/jobs/${w.job.id}/interviewers`, { stages: [{ stageId, interviewers: [{ kind: 'external', name: 'Elena Scaduta', email }] }] });
    const applied = await applyAs(w);
    await w.owner.post(`/api/v1/applications/${applied.applicationId}/move`, { stageId });
    const token = tokenFromMail(email);
    expect((await anonymous('GET', `/api/v1/public/feedback/${token}`)).statusCode).toBe(200);
    await t.handle.pool.query(`update feedback_request set expires_at = now() - interval '1 day' where application_id = $1`, [applied.applicationId]);
    expect((await anonymous('GET', `/api/v1/public/feedback/${token}`)).statusCode).toBe(404);
    expect((await anonymous('GET', `/api/v1/public/feedback/${token}/cv`)).statusCode).toBe(404);
    expect((await anonymous('POST', `/api/v1/public/feedback/${token}`, { answers: {}, recommendation: 'proceed' })).statusCode).toBe(404);
  });

  it('is removed with the candidate on erasure, and leaves no trace of the interviewer link', async () => {
    const w = await createWorld(t);
    const stageId = await declaredStage(w);
    const email = uniqueMail('erase');
    await w.owner.put(`/api/v1/jobs/${w.job.id}/interviewers`, { stages: [{ stageId, interviewers: [{ kind: 'external', name: 'Erasure Reviewer', email }] }] });
    const applied = await applyAs(w);
    await w.owner.post(`/api/v1/applications/${applied.applicationId}/move`, { stageId });
    const token = tokenFromMail(email);
    const form = (await anonymous('GET', `/api/v1/public/feedback/${token}`)).json().data as PublicForm;
    const marker = `Nota-${randomUUID()}`;
    await anonymous('POST', `/api/v1/public/feedback/${token}`, { answers: Object.fromEntries(form.questions.map((q) => [q.id, marker])), recommendation: 'discuss' });
    expect(Object.keys(await leftovers(t, [marker]))).toContain('interview_feedback');

    const name = `${applied.person.firstName} ${applied.person.lastName}`;
    expect((await w.owner.post(`/api/v1/candidates/${applied.candidateId}/erase`, { confirmName: name })).status).toBe(200);
    expect(await leftovers(t, [marker, applied.applicationId])).toEqual({});
    expect(await auditMentions(t, [applied.person.email, applied.person.firstName, marker])).toBe(0);
    expect((await anonymous('GET', `/api/v1/public/feedback/${token}`)).statusCode).toBe(404);
  });

  it('lets only the roles that manage feedback configure it, and keeps organizations apart', async () => {
    const w = await createWorld(t);
    const stageId = await declaredStage(w);
    const body = { stages: [{ stageId, interviewers: [{ kind: 'external', name: 'Ugo', email: uniqueMail('ugo') }] }] };
    const [hm, recruiter, interviewer] = [await w.member('hiring_manager'), await w.member('recruiter'), await w.member('interviewer')];
    await w.joinTeam(hm, 'hiring_manager');
    await w.joinTeam(interviewer, 'interviewer');
    expect((await hm.put(`/api/v1/jobs/${w.job.id}/interviewers`, body)).status).toBe(200);
    expect((await recruiter.put(`/api/v1/jobs/${w.job.id}/interviewers`, body)).status).toBe(200);
    expect((await interviewer.put(`/api/v1/jobs/${w.job.id}/interviewers`, body)).status).toBe(403);
    expect((await interviewer.get(`/api/v1/jobs/${w.job.id}/interviewers`)).status).toBe(200);
    const applied = await applyAs(w);
    expect((await interviewer.post(`/api/v1/applications/${applied.applicationId}/feedback/request`, {})).status).toBe(403);
    expect((await interviewer.get(`/api/v1/applications/${applied.applicationId}/feedback`)).status).toBe(200);

    const other = await createWorld(t, 'Other');
    expect((await other.owner.get(`/api/v1/jobs/${w.job.id}/interviewers`)).status).toBe(404);
    expect((await other.owner.put(`/api/v1/jobs/${w.job.id}/interviewers`, body)).status).toBe(404);
    expect((await other.owner.get(`/api/v1/applications/${applied.applicationId}/feedback`)).status).toBe(404);
    expect((await anonymous('GET', `/api/v1/jobs/${w.job.id}/interviewers`)).statusCode).toBe(401);
  });

  it('asks again by hand, with a new link, and an API key with the scope can do it', async () => {
    const w = await createWorld(t);
    const stageId = await declaredStage(w);
    const applied = await applyAs(w);
    await w.owner.post(`/api/v1/applications/${applied.applicationId}/move`, { stageId });
    const email = uniqueMail('manual');
    const manual = await w.owner.post<{ stageLabel: string; interviewerName: string }[]>(`/api/v1/applications/${applied.applicationId}/feedback/request`, { interviewer: { kind: 'external', name: 'Manuela', email } });
    expect(manual.status).toBe(201);
    expect(manual.body.data![0]).toMatchObject({ interviewerName: 'Manuela' });
    expect(tokenFromMail(email)).toBeTruthy();
    const key = await createKey(w.owner, ['feedback:read']);
    expect((await withKey(t.app, key.secret, 'GET', `/api/v1/applications/${applied.applicationId}/feedback`)).status).toBe(200);
    expect((await withKey(t.app, key.secret, 'POST', `/api/v1/applications/${applied.applicationId}/feedback/request`, { body: {} })).status).toBe(403);
  });
});

describe('job requests and approval', () => {
  const request = { title: 'Backend Developer', reason: 'Nuovo team pagamenti', headcount: 1, salaryMin: 35000, salaryMax: 45000 };

  it('converts at once when approval is off', async () => {
    const w = await createWorld(t);
    const hm = await w.member('hiring_manager');
    const created = await hm.post<{ id: string; status: string }>('/api/v1/job-requests', request);
    expect(created.status).toBe(201);
    const converted = await hm.post<{ id: string; status: string }>(`/api/v1/job-requests/${created.body.data!.id}/convert`);
    expect(converted.status).toBe(201);
    expect(converted.body.data!.status).toBe('draft');
    expect((await w.owner.get<{ status: string }>(`/api/v1/job-requests/${created.body.data!.id}`)).body.data!.status).toBe('converted');
    expect((await hm.post(`/api/v1/job-requests/${created.body.data!.id}/convert`)).status).toBe(409);
  });

  it('with approval on needs an approval to convert and refuses publication beyond the approved maximum', async () => {
    const w = await createWorld(t);
    const [hm, recruiter] = [await w.member('hiring_manager'), await w.member('recruiter')];
    expect((await hm.put('/api/v1/settings/approval', { requireApproval: true })).status).toBe(403);
    expect((await w.owner.put('/api/v1/settings/approval', { requireApproval: true })).body.data).toEqual({ requireApproval: true });
    expect((await hm.get('/api/v1/settings/approval')).body.data).toEqual({ requireApproval: true });

    const created = await hm.post<{ id: string }>('/api/v1/job-requests', request);
    const id = created.body.data!.id;
    const early = await hm.post(`/api/v1/job-requests/${id}/convert`);
    expect(early.status).toBe(422);
    expect(issuesOf(early)).toContainEqual({ path: 'status', message: 'approval_required' });
    expect((await hm.post(`/api/v1/job-requests/${id}/approve`, {})).status).toBe(403);
    expect((await recruiter.post(`/api/v1/job-requests/${id}/reject`, { note: 'no' })).status).toBe(403);
    expect((await w.owner.post(`/api/v1/job-requests/${id}/reject`, {})).status).toBe(422);

    const approved = await w.owner.post<{ status: string; decidedBy: string }>(`/api/v1/job-requests/${id}/approve`, { note: 'Ok con il budget' });
    expect(approved.body.data).toMatchObject({ status: 'approved' });
    const job = (await hm.post<{ id: string }>(`/api/v1/job-requests/${id}/convert`)).body.data!;
    expect((await w.owner.get<{ approval: { salaryMax: number } | null; publishable: boolean }>(`/api/v1/jobs/${job.id}/approval`)).body.data).toMatchObject({ approval: { salaryMax: 45000 }, publishable: true });

    const beyond = await w.owner.put(`/api/v1/jobs/${job.id}`, { content: completeJobContent({ title: 'Backend Developer/ssa', salary: { min: 40000, max: 60000, currency: 'EUR', period: 'year' } }) });
    expect(beyond.status).toBe(200);
    const refused = await w.owner.post(`/api/v1/jobs/${job.id}/publish`);
    expect(refused.status).toBe(422);
    expect(issuesOf(refused)).toContainEqual({ path: 'approval', message: 'approval_range_exceeded' });
    await w.owner.put(`/api/v1/jobs/${job.id}`, { content: completeJobContent({ title: 'Backend Developer/ssa', salary: { min: 35000, max: 44000, currency: 'EUR', period: 'year' } }) });
    expect((await w.owner.post(`/api/v1/jobs/${job.id}/publish`)).status).toBe(200);

    // A draft created directly has no approval and cannot be published until it asks and gets one.
    const direct = (await w.owner.post<{ id: string }>('/api/v1/jobs', { content: completeJobContent({ title: 'Data Engineer/ssa' }) })).body.data!;
    const noApproval = await w.owner.post(`/api/v1/jobs/${direct.id}/publish`);
    expect(issuesOf(noApproval)).toContainEqual({ path: 'approval', message: 'approval_required' });
    expect((await w.owner.post(`/api/v1/jobs/${direct.id}/approval-request`, { reason: 'Serve per il team dati' })).status).toBe(201);
  });

  it('keeps requests of other organizations apart and refuses keys on approval', async () => {
    const w = await createWorld(t);
    const created = await w.owner.post<{ id: string }>('/api/v1/job-requests', request);
    const other = await createWorld(t, 'Other');
    expect((await other.owner.get(`/api/v1/job-requests/${created.body.data!.id}`)).status).toBe(404);
    expect((await other.owner.get<unknown[]>('/api/v1/job-requests')).body.data).toEqual([]);
    expect((await w.owner.get<unknown[]>('/api/v1/job-requests?status=submitted')).body.data).toHaveLength(1);
    const key = await createKey(w.owner, ['job:read', 'job:create']);
    expect((await withKey(t.app, key.secret, 'POST', `/api/v1/job-requests/${created.body.data!.id}/approve`, { body: {} })).status).toBe(403);
    expect((await withKey(t.app, key.secret, 'PUT', '/api/v1/settings/approval', { body: { requireApproval: true } })).status).toBe(403);
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/job-requests')).status).toBe(200);
  });
});

describe('stale ads', () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

  it('lists a published ad after 90 days without activity, per organization, and notifies its owner once', async () => {
    const w = await createWorld(t);
    const job = await publishJob(w.owner, 'Annuncio Fermo');
    const staleIds = async (user: World['owner']) => (await user.get<{ job: { id: string }; daysIdle: number }[]>('/api/v1/jobs/stale')).body.data!.map((s) => s.job.id);
    expect(await staleIds(w.owner)).toEqual([]);

    await t.handle.pool.query(`update job set published_at = $2, updated_at = $2 where id = $1`, [job.id, daysAgo(91)]);
    await t.handle.pool.query(`update job set published_at = now(), updated_at = now() where organization_id = (select organization_id from job where id = $1) and id <> $1`, [job.id]);
    const listed = (await w.owner.get<{ job: { id: string }; daysIdle: number }[]>('/api/v1/jobs/stale')).body.data!;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ job: { id: job.id, status: 'published' }, daysIdle: 91 });
    expect(await staleIds((await createWorld(t, 'Other')).owner)).toEqual([]);

    const db = t.handle.db;
    const deps = { staleJobs: createDrizzleStaleJobs(db), jobs: createDrizzleJobs(db), jobTeams: createDrizzleJobTeams(db), notifications: createDrizzleNotifications(db), members: createDrizzleMemberDirectory(db), newId: randomUUID };
    await scanStaleJobs(deps, { now: new Date() });
    await scanStaleJobs(deps, { now: new Date() });
    const { rows } = await t.handle.pool.query(`select kind, user_id from notification where job_id = $1`, [job.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('job_stale');
    expect((await w.owner.get<{ status: string }>(`/api/v1/jobs/${job.id}`)).body.data!.status).toBe('published');
  });

  it('moves the last activity forward when an application arrives, and an injected clock finds a fresh ad stale 91 days later', async () => {
    const w = await createWorld(t);
    const staleJobs = createDrizzleStaleJobs(t.handle.db);
    const day = 86_400_000;
    const activityOf = async (now: Date) => (await staleJobs.listStale(new Date(now.getTime() - 90 * day))).find((s) => s.job.id === w.job.id)?.lastActivityAt;
    expect(await activityOf(new Date())).toBeUndefined();
    const later = new Date(Date.now() + 91 * day);
    const before = await activityOf(later);
    expect(before).toBeInstanceOf(Date);
    await applyAs(w);
    const after = await activityOf(new Date(later.getTime() + day));
    expect(after!.getTime()).toBeGreaterThan(before!.getTime());
  });

  it('is open to readers of jobs and refused to anonymous callers', async () => {
    const w = await createWorld(t);
    const interviewer = await w.member('interviewer');
    expect((await interviewer.get('/api/v1/jobs/stale')).status).toBe(200);
    expect((await anonymous('GET', '/api/v1/jobs/stale')).statusCode).toBe(401);
  });
});
