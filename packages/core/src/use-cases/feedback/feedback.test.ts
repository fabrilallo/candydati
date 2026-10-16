import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildApplication, fakePdfBytes, ORG_A, ORG_B, seedHrWorld, userActor, type TestHrDeps } from '../../testing/index.js';
import { moveApplication } from '../candidates/move-application.js';
import { eraseApplication } from '../privacy/erase-candidate.js';
import { exportCandidate } from '../privacy/export-candidate.js';
import { getJobInterviewers, setJobInterviewers } from './interviewers.js';
import { listApplicationFeedback } from './list-feedback.js';
import { getFeedbackRequest, openFeedbackCv, submitFeedback } from './public.js';
import { requestFeedback } from './request-feedback.js';
import { reminderIsDue, scanFeedbackReminders } from './scan-reminders.js';

const DAY = 86_400_000;
const NOW = new Date('2026-06-01T10:00:00.000Z');
const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const owner = userActor({ id: 'user_test', role: 'owner', organizationId: ORG_A });
const EXTERNAL = { kind: 'external', email: 'Ext.Person@partner.example', name: 'Eva External' } as const;
const SET = { jobId: 'job_1', stages: [{ stageId: 'stage-1', interviewers: [{ kind: 'member', userId: 'hm_1' }, EXTERNAL] }] };
const GOOD = { answers: { tech_shown: 'Solid design sense', tech_open: 'Concurrency' }, recommendation: 'proceed' as const };

const world = (): TestHrDeps => seedHrWorld();
const secretsOf = (deps: TestHrDeps): string[] => deps.sender.sent().flatMap((mail) => [...mail.text.matchAll(/\/feedback\/([a-z]+)/g)].map((m) => m[1] as string));
const at = (ms: number) => new Date(NOW.getTime() + ms);
const configured = async (deps: TestHrDeps) => {
  await setJobInterviewers(deps, recruiter, SET);
  return deps;
};

describe('setJobInterviewers / getJobInterviewers', () => {
  it('stores members and externals per stage, filling the member name and lowercasing the email', async () => {
    const deps = world();
    const view = await setJobInterviewers(deps, recruiter, SET);
    expect(view).toHaveLength(1);
    expect(view[0]?.interviewers).toMatchObject([
      { kind: 'member', userId: 'hm_1', name: 'Hugo Manager', email: null },
      { kind: 'external', userId: null, email: 'ext.person@partner.example', name: 'Eva External' },
    ]);
    expect(await getJobInterviewers(deps, recruiter, { jobId: 'job_1' })).toEqual(view);
    expect(deps.auditLog.events().map((e) => e.action)).toContain('job.interviewers_updated');
  });

  it('replaces the whole configuration', async () => {
    const deps = await configured(world());
    await setJobInterviewers(deps, recruiter, { jobId: 'job_1', stages: [] });
    expect(await getJobInterviewers(deps, recruiter, { jobId: 'job_1' })).toEqual([]);
  });

  it('refuses unknown or received stages, strangers, duplicates, too many people and incomplete entries', async () => {
    const deps = world();
    const attempt = (stages: unknown) => setJobInterviewers(deps, recruiter, { jobId: 'job_1', stages });
    await expect(attempt([{ stageId: 'received', interviewers: [EXTERNAL] }])).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt([{ stageId: 'nope', interviewers: [EXTERNAL] }])).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt([{ stageId: 'stage-1', interviewers: [{ kind: 'member', userId: 'stranger' }] }])).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt([{ stageId: 'stage-1', interviewers: [EXTERNAL, { ...EXTERNAL, email: 'EXT.person@partner.example' }] }])).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt([{ stageId: 'stage-1', interviewers: Array.from({ length: 6 }, (_, i) => ({ ...EXTERNAL, email: `p${i}@x.example` })) }])).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt([{ stageId: 'stage-1', interviewers: [{ kind: 'external', email: 'a@b.example' }] }])).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt([{ stageId: 'stage-1', interviewers: [] }, { stageId: 'stage-1', interviewers: [] }])).rejects.toBeInstanceOf(ValidationError);
  });

  it('role matrix: manage for owner, admin, recruiter and hiring manager; read for all; none for outsiders', async () => {
    for (const role of ['owner', 'admin', 'recruiter', 'hiring_manager'] as const) {
      await expect(setJobInterviewers(world(), userActor({ role, organizationId: ORG_A }), SET)).resolves.toBeDefined();
    }
    await expect(setJobInterviewers(world(), userActor({ role: 'interviewer', organizationId: ORG_A }), SET)).rejects.toBeInstanceOf(ForbiddenError);
    for (const role of ['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer'] as const) {
      await expect(getJobInterviewers(world(), userActor({ role, organizationId: ORG_A }), { jobId: 'job_1' })).resolves.toEqual([]);
    }
  });

  it('isolates organizations: a job of another organization does not exist', async () => {
    const deps = world();
    await expect(setJobInterviewers(deps, userActor({ role: 'owner', organizationId: ORG_B }), SET)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getJobInterviewers(deps, userActor({ role: 'owner', organizationId: ORG_B }), { jobId: 'job_1' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('asking for feedback when an application enters a stage', () => {
  it('creates one request per interviewer, emails each a link and audits it, with only the hash stored', async () => {
    const deps = await configured(world());
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
    const requests = deps.feedbackStore.read().requests;
    expect(requests).toHaveLength(2);
    expect(requests.map((r) => r.interviewerEmail).sort()).toEqual(['ext.person@partner.example', 'hugo@acme.example']);
    expect(requests[0]).toMatchObject({ applicationId: 'app_1', jobId: 'job_1', stageId: 'stage-1', remindersSent: 0, lastReminderAt: null, submittedAt: null, requestedBy: 'recruiter_1' });
    expect(requests[0]?.expiresAt).toEqual(new Date(NOW.getTime() + 14 * DAY));
    const secrets = secretsOf(deps);
    expect(secrets).toHaveLength(2);
    for (const request of requests) expect(secrets).not.toContain(request.tokenHash);
    expect(JSON.stringify(requests)).not.toContain(secrets[0]);
    const mail = deps.sender.sent().find((m) => m.to === 'hugo@acme.example');
    expect(mail?.from).toContain('jobs@mail.platform.example');
    expect(mail?.text).toContain('https://platform.example/feedback/');
    expect(mail?.text).toContain('Ada Lovelace');
    expect(deps.auditLog.events().filter((e) => e.action === 'feedback.requested')).toHaveLength(2);
    expect(JSON.stringify(deps.auditLog.events())).not.toContain('ext.person');
  });

  it('does nothing for a stage with no interviewers and never asks twice when the application comes back', async () => {
    const deps = await configured(world());
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' });
    expect(deps.feedbackStore.read().requests).toHaveLength(0);
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' });
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
    expect(deps.feedbackStore.read().requests).toHaveLength(2);
  });

  it('asks again once the earlier request has expired', async () => {
    const deps = await configured(world());
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' });
    const later = { ...deps, now: () => at(15 * DAY) };
    await moveApplication(later, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
    expect(deps.feedbackStore.read().requests).toHaveLength(4);
  });

  it('keeps the move when emailing fails and reports the error', async () => {
    const errors: unknown[] = [];
    const failing = seedHrWorld({ hrOverrides: {} });
    const broken = { ...failing.feedback, sender: { send: async () => Promise.reject(new Error('smtp down')) }, onError: (e: unknown) => errors.push(e) };
    const deps = { ...failing, feedback: broken };
    await setJobInterviewers(deps, recruiter, SET);
    const result = await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
    expect(result.application.stageId).toBe('stage-1');
    expect(errors).toHaveLength(2);
    expect(deps.feedbackStore.read().requests).toHaveLength(2);
  });

  it('keeps the move when the request store itself fails', async () => {
    const errors: unknown[] = [];
    const base = await configured(world());
    const deps = {
      ...base,
      feedback: { ...base.feedback!, feedbackRequests: { ...base.feedbackRequests, listByApplication: async () => Promise.reject(new Error('db down')) }, onError: (e: unknown) => errors.push(e) },
    };
    const result = await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
    expect(result.application.stageId).toBe('stage-1');
    expect(errors).toHaveLength(1);
  });

  it('skips applications whose consent is still to be renewed', async () => {
    const deps = seedHrWorld({ applications: [buildApplication({ organizationId: ORG_A, consentStatus: 'to_renew' })] });
    await setJobInterviewers(deps, recruiter, SET);
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
    expect(deps.feedbackStore.read().requests).toHaveLength(0);
  });

  it('does not run when feedback is not wired', async () => {
    const { feedback: _wired, ...deps } = await configured(world());
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
    expect(deps.feedbackStore.read().requests).toHaveLength(0);
  });
});

describe('requestFeedback (by hand)', () => {
  it('asks the configured interviewers of the current stage again with new links, and returns views without secrets', async () => {
    const deps = await configured(world());
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
    const views = await requestFeedback(deps, recruiter, { applicationId: 'app_1' });
    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({ stageId: 'stage-1', status: 'pending', stageLabel: 'Colloquio tecnico' });
    expect(JSON.stringify(views)).not.toMatch(/tokenHash|ext\.person/);
    expect(deps.feedbackStore.read().requests).toHaveLength(4);
    expect(new Set(secretsOf(deps)).size).toBe(4);
  });

  it('can ask one more person, member or external', async () => {
    const deps = world();
    const views = await requestFeedback(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0', interviewer: { kind: 'member', userId: 'recruiter_1' } });
    expect(views).toHaveLength(1);
    expect(deps.sender.sent()[0]?.to).toBe('rita@acme.example');
    await requestFeedback(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0', interviewer: EXTERNAL });
    expect(deps.sender.sent()[1]?.to).toBe('ext.person@partner.example');
  });

  it('refuses when nobody is configured, for the received stage, for unknown applications and for stranger members', async () => {
    const deps = world();
    await expect(requestFeedback(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' })).rejects.toBeInstanceOf(ValidationError);
    await expect(requestFeedback(deps, recruiter, { applicationId: 'app_1' })).rejects.toBeInstanceOf(ValidationError);
    await expect(requestFeedback(deps, recruiter, { applicationId: 'nope', stageId: 'stage-0' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(requestFeedback(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0', interviewer: { kind: 'member', userId: 'stranger' } })).rejects.toBeInstanceOf(ValidationError);
  });

  it('needs feedback:manage and the right organization', async () => {
    const deps = world();
    await expect(requestFeedback(deps, userActor({ role: 'interviewer', organizationId: ORG_A }), { applicationId: 'app_1', stageId: 'stage-0', interviewer: EXTERNAL })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requestFeedback(deps, userActor({ role: 'owner', organizationId: ORG_B }), { applicationId: 'app_1', stageId: 'stage-0', interviewer: EXTERNAL })).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.sender.sent()).toHaveLength(0);
  });
});

async function asked(): Promise<{ deps: TestHrDeps; secret: string }> {
  const deps = await configured(world());
  await deps.files.put(deps.store.read().applications[0]?.cv?.key ?? '', fakePdfBytes(), 'application/pdf');
  await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
  return { deps, secret: secretsOf(deps)[0] as string };
}

describe('the public form', () => {
  it('shows only what the interviewer needs, localized, without contact data or ids', async () => {
    const { deps, secret } = await asked();
    const view = await getFeedbackRequest(deps, { token: secret });
    expect(view).toMatchObject({
      organizationName: 'Acme',
      language: 'it',
      candidate: { firstName: expect.any(String), lastName: expect.any(String) },
      jobTitle: 'Backend Developer',
      stage: { label: 'Colloquio tecnico', note: null },
      hasCv: true,
      submission: null,
    });
    expect(view.questions.map((q) => q.id)).toEqual(['tech_shown', 'tech_open', 'candidate_questions']);
    expect(view.questions[0]?.label).toBe('Cosa ha mostrato sul piano tecnico');
    expect(view.recommendations).toEqual(['proceed', 'do_not_proceed', 'discuss']);
    const text = JSON.stringify(view);
    const candidate = deps.store.read().candidates[0];
    for (const hidden of [candidate?.email, candidate?.phone, 'app_1', 'cand_1', 'tokenHash'] as const) if (hidden) expect(text).not.toContain(hidden);
  });

  it('opens the CV of the person, audited with ids only', async () => {
    const { deps, secret } = await asked();
    const file = await openFeedbackCv(deps, { token: secret });
    expect(file).toMatchObject({ mediaType: 'application/pdf', inlineable: true });
    expect(file.bytes.byteLength).toBeGreaterThan(0);
    const event = deps.auditLog.events().find((e) => e.action === 'feedback.cv_opened');
    expect(event).toMatchObject({ actor: { type: 'system', id: 'feedback_page' }, metadata: { applicationId: 'app_1' } });
    await deps.files.delete(deps.store.read().applications[0]?.cv?.key ?? '');
    await expect(openFeedbackCv(deps, { token: secret })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('says there is no CV for a migrated application without one, and opens nothing', async () => {
    const { deps, secret } = await asked();
    deps.store.write({ applications: deps.store.read().applications.map((a) => (a.id === 'app_1' ? { ...a, cv: null, migrationBatchId: 'mig_1' } : a)) });
    expect((await getFeedbackRequest(deps, { token: secret })).hasCv).toBe(false);
    await expect(openFeedbackCv(deps, { token: secret })).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.auditLog.events().some((e) => e.action === 'feedback.cv_opened')).toBe(false);
  });

  it('saves the feedback once, then the link is read-only and shows what was written', async () => {
    const { deps, secret } = await asked();
    const result = await submitFeedback(deps, { token: secret, ...GOOD });
    expect(result.submittedAt).toEqual(NOW);
    const stored = deps.feedbackStore.read().feedback;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ applicationId: 'app_1', stageId: 'stage-1', answers: GOOD.answers, recommendation: 'proceed' });
    expect(Object.keys(stored[0] ?? {}).filter((key) => /score|rating|vote/.test(key))).toEqual([]);
    await expect(submitFeedback(deps, { token: secret, ...GOOD })).rejects.toBeInstanceOf(ConflictError);
    const view = await getFeedbackRequest(deps, { token: secret });
    expect(view.submission).toMatchObject({ answers: GOOD.answers, recommendation: 'proceed' });
    expect(deps.auditLog.events().find((e) => e.action === 'feedback.submitted')).toMatchObject({ metadata: { applicationId: 'app_1', recommendation: 'proceed' } });
    expect(JSON.stringify(deps.auditLog.events())).not.toContain('Solid design sense');
  });

  it('lets two concurrent submissions of one link produce a single feedback', async () => {
    const { deps, secret } = await asked();
    const results = await Promise.allSettled([submitFeedback(deps, { token: secret, ...GOOD }), submitFeedback(deps, { token: secret, ...GOOD })]);
    expect(deps.feedbackStore.read().feedback).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('accepts no score, rating or other field, and no unknown question', async () => {
    const { deps, secret } = await asked();
    for (const extra of [{ score: 4 }, { rating: 'A' }, { overall: 3 }]) {
      await expect(submitFeedback(deps, { token: secret, ...GOOD, ...extra })).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(submitFeedback(deps, { token: secret, ...GOOD, answers: { ...GOOD.answers, score: '5' } })).rejects.toBeInstanceOf(ValidationError);
    await expect(submitFeedback(deps, { token: secret, ...GOOD, recommendation: 'hire' })).rejects.toBeInstanceOf(ValidationError);
    expect(deps.feedbackStore.read().feedback).toHaveLength(0);
  });

  it('requires the required answers and caps their length', async () => {
    const { deps, secret } = await asked();
    await expect(submitFeedback(deps, { token: secret, answers: { tech_shown: ' ' }, recommendation: 'discuss' })).rejects.toBeInstanceOf(ValidationError);
    await expect(submitFeedback(deps, { token: secret, answers: { ...GOOD.answers, tech_shown: 'x'.repeat(2001) }, recommendation: 'discuss' })).rejects.toBeInstanceOf(ValidationError);
    await expect(submitFeedback(deps, { token: secret, answers: GOOD.answers, recommendation: 'do_not_proceed' })).resolves.toBeDefined();
  });

  it('treats unknown, malformed and expired links alike', async () => {
    const { deps, secret } = await asked();
    await expect(getFeedbackRequest(deps, { token: 'z'.repeat(24) })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getFeedbackRequest(deps, { token: 'short' })).rejects.toBeInstanceOf(ValidationError);
    const expired = { ...deps, now: () => at(14 * DAY) };
    await expect(getFeedbackRequest(expired, { token: secret })).rejects.toBeInstanceOf(NotFoundError);
    await expect(submitFeedback(expired, { token: secret, ...GOOD })).rejects.toBeInstanceOf(NotFoundError);
    await expect(openFeedbackCv(expired, { token: secret })).rejects.toBeInstanceOf(NotFoundError);
    const justBefore = { ...deps, now: () => at(14 * DAY - 1000) };
    await expect(getFeedbackRequest(justBefore, { token: secret })).resolves.toBeDefined();
  });

  it('expires a submitted link too: the CV and the answers are no longer readable', async () => {
    const { deps, secret } = await asked();
    await submitFeedback(deps, { token: secret, ...GOOD });
    await expect(getFeedbackRequest(deps, { token: secret })).resolves.toBeDefined();
    const expired = { ...deps, now: () => at(14 * DAY) };
    await expect(openFeedbackCv(expired, { token: secret })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getFeedbackRequest(expired, { token: secret })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('closes the link when the application is gone', async () => {
    const { deps, secret } = await asked();
    const candidate = deps.store.read().candidates[0];
    if (candidate) await eraseApplication(deps, owner, { applicationId: 'app_1', confirmName: `${candidate.firstName} ${candidate.lastName}` }).catch(() => undefined);
    await expect(getFeedbackRequest(deps, { token: secret })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('listApplicationFeedback', () => {
  it('shows who was asked, who answered and the answers with their questions', async () => {
    const { deps, secret } = await asked();
    await submitFeedback(deps, { token: secret, ...GOOD });
    const view = await listApplicationFeedback(deps, userActor({ role: 'interviewer', organizationId: ORG_A }), { applicationId: 'app_1' });
    expect(view.requests.map((r) => r.status).sort()).toEqual(['pending', 'submitted']);
    expect(view.feedback).toHaveLength(1);
    expect(view.feedback[0]).toMatchObject({ stageLabel: 'Colloquio tecnico', recommendation: 'proceed' });
    expect(view.feedback[0]?.answers[0]).toEqual({ questionId: 'tech_shown', question: 'Cosa ha mostrato sul piano tecnico', answer: 'Solid design sense' });
    expect(JSON.stringify(view)).not.toContain('tokenHash');
  });

  it('marks requests expired and is isolated per organization', async () => {
    const { deps } = await asked();
    const later = { ...deps, now: () => at(20 * DAY) };
    expect((await listApplicationFeedback(later, recruiter, { applicationId: 'app_1' })).requests.every((r) => r.status === 'expired')).toBe(true);
    await expect(listApplicationFeedback(deps, userActor({ role: 'owner', organizationId: ORG_B }), { applicationId: 'app_1' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('reminders', () => {
  it('sends a reminder after 2 days and another after 5, with a new link each time, and never more', async () => {
    const { deps } = await asked();
    expect(await scanFeedbackReminders(deps, { now: at(1 * DAY) })).toEqual({ reminded: 0, failed: 0 });
    const first = await scanFeedbackReminders(deps, { now: at(2 * DAY) });
    expect(first).toEqual({ reminded: 2, failed: 0 });
    expect(deps.sender.sent()).toHaveLength(4);
    expect(deps.sender.sent()[2]?.subject.startsWith('Promemoria')).toBe(true);
    expect(await scanFeedbackReminders(deps, { now: at(2 * DAY + 3_600_000) })).toEqual({ reminded: 0, failed: 0 });
    expect(await scanFeedbackReminders(deps, { now: at(4 * DAY) })).toEqual({ reminded: 0, failed: 0 });
    expect(await scanFeedbackReminders(deps, { now: at(5 * DAY) })).toEqual({ reminded: 2, failed: 0 });
    expect(await scanFeedbackReminders(deps, { now: at(6 * DAY) })).toEqual({ reminded: 0, failed: 0 });
    expect(deps.feedbackStore.read().requests.map((r) => [r.remindersSent, r.lastReminderAt])).toEqual([[2, at(5 * DAY)], [2, at(5 * DAY)]]);
    expect(new Set(secretsOf(deps)).size).toBe(6);
  });

  it('invalidates the old link when it sends a new one, and the new one works', async () => {
    const { deps, secret } = await asked();
    await scanFeedbackReminders(deps, { now: at(2 * DAY) });
    const fresh = secretsOf(deps)[2] as string;
    const during = { ...deps, now: () => at(2 * DAY) };
    await expect(getFeedbackRequest(during, { token: secret })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getFeedbackRequest(during, { token: fresh })).resolves.toBeDefined();
  });

  it('skips submitted and expired requests, and keeps the old link when the email fails', async () => {
    const { deps, secret } = await asked();
    await submitFeedback(deps, { token: secret, ...GOOD });
    expect(await scanFeedbackReminders(deps, { now: at(2 * DAY) })).toEqual({ reminded: 1, failed: 0 });
    expect(await scanFeedbackReminders(deps, { now: at(15 * DAY) })).toEqual({ reminded: 0, failed: 0 });

    const other = await asked();
    const before = other.deps.feedbackStore.read().requests;
    const failing = { ...other.deps, sender: { send: async () => Promise.reject(new Error('smtp down')) } };
    expect(await scanFeedbackReminders(failing, { now: at(2 * DAY) })).toEqual({ reminded: 0, failed: 2 });
    expect(other.deps.feedbackStore.read().requests).toEqual(before);
    await expect(getFeedbackRequest({ ...other.deps, now: () => at(2 * DAY) }, { token: other.secret })).resolves.toBeDefined();
  });

  it('never overwrites a submission that lands while the reminder is being prepared (#18)', async () => {
    const { deps, secret } = await asked();
    // The scan reads the open requests, then the interviewer submits before the reminder is written.
    const list = async (now: Date) => {
      const open = await deps.feedbackRequests.listOpenAcrossOrganizations(now);
      await submitFeedback({ ...deps, now: () => at(DAY) }, { token: secret, ...GOOD });
      return open;
    };
    const racing = { ...deps, feedbackRequests: { ...deps.feedbackRequests, listOpenAcrossOrganizations: list } };
    expect(await scanFeedbackReminders(racing, { now: at(2 * DAY) })).toEqual({ reminded: 1, failed: 0 });
    expect(deps.feedbackStore.read().requests.filter((r) => r.submittedAt !== null)).toEqual([expect.objectContaining({ remindersSent: 0, submittedAt: at(DAY) })]);
  });

  it('reports a failing store and goes on', async () => {
    const { deps } = await asked();
    const errors: unknown[] = [];
    const broken = { ...deps, onError: (e: unknown) => errors.push(e), applications: { ...deps.applications, findById: async () => Promise.reject(new Error('db down')) } };
    expect(await scanFeedbackReminders(broken, { now: at(2 * DAY) })).toEqual({ reminded: 0, failed: 2 });
    expect(errors).toHaveLength(2);
  });

  it('reminderIsDue follows the 2 and 5 day schedule', () => {
    const base = { createdAt: NOW, expiresAt: at(14 * DAY), submittedAt: null, remindersSent: 0, lastReminderAt: null } as never;
    expect(reminderIsDue(base, at(2 * DAY - 1))).toBe(false);
    expect(reminderIsDue(base, at(2 * DAY))).toBe(true);
    expect(reminderIsDue({ ...(base as object), remindersSent: 1, lastReminderAt: at(2 * DAY) } as never, at(5 * DAY))).toBe(true);
    expect(reminderIsDue({ ...(base as object), remindersSent: 2 } as never, at(9 * DAY))).toBe(false);
  });
});

describe('export and erasure include feedback', () => {
  it('exports requests and feedback of the candidate in the public schema', async () => {
    const { deps, secret } = await asked();
    await submitFeedback(deps, { token: secret, ...GOOD });
    const { json } = await exportCandidate(deps, owner, { candidateId: 'cand_1' });
    const application = json.applications[0];
    expect(application?.feedback).toMatchObject([{ stageId: 'stage-1', answers: GOOD.answers, recommendation: 'proceed' }]);
    expect(application?.feedbackRequests).toHaveLength(2);
    expect(JSON.stringify(json)).not.toMatch(/tokenHash|ext\.person/);
  });

  it('erasing the application removes its requests and feedback and nothing else', async () => {
    const { deps, secret } = await asked();
    await submitFeedback(deps, { token: secret, ...GOOD });
    const candidate = deps.store.read().candidates[0];
    await eraseApplication(deps, owner, { applicationId: 'app_1', confirmName: `${candidate?.firstName} ${candidate?.lastName}` });
    expect(deps.feedbackStore.read().requests).toEqual([]);
    expect(deps.feedbackStore.read().feedback).toEqual([]);
    expect(deps.feedbackStore.read().interviewers).toHaveLength(2);
  });
});
