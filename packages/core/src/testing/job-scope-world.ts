import type { Actor } from '../actor.js';
import { NotFoundError, ForbiddenError } from '../errors.js';
import { agentActor, apiKeyActor, userActor } from './actors.js';
import { buildAutomationRule, buildNotification, buildTask } from './automation-fixtures.js';
import { buildApplication, buildCandidate, buildExtraction, buildNote, fakePdfBytes } from './candidate-fixtures.js';
import { ORG_A } from './candidate-seed.js';
import { testHash, type TestHrDeps } from './hr-deps.js';
import { seedImportWorld, type TestImportDeps } from './import-deps.js';
import { createInMemoryJobRequests, createInMemoryStaleJobs } from './in-memory-job-requests.js';
import type { InMemoryJobRepository } from './in-memory-jobs.js';
import { buildJob, completeJobContent } from './job-fixtures.js';
import { buildMessage } from './messaging-fixtures.js';
import { createDistributionRegistry } from '../distribution-registry.js';
import { createFakeDistributionChannel, createInMemoryDistributionSettings, createInMemoryJobDistributions } from './in-memory-distribution.js';

/**
 * Two jobs of one organization: A (`job_1`, the actors' team) and B (`job_b`, nobody's but the owner's). Everything about
 * B carries one of `LEAK_MARKERS`: if any of them shows up in what a job-A actor gets back, per-job access leaked.
 */
export const JOB_A = 'job_1';
export const JOB_B = 'job_b';
export const LEAK_MARKERS = ['job_b', 'app_b', 'cand_b', 'Bravoleak', 'Secret Bravo', 'app_s2', 'SHARED-B', 'B-ONLY'] as const;

export const ACTORS_OF_JOB_A: Readonly<Record<string, Actor>> = {
  interviewer: userActor({ organizationId: ORG_A, id: 'int_a', role: 'interviewer' }),
  hiringManager: userActor({ organizationId: ORG_A, id: 'hm_a', role: 'hiring_manager' }),
  restrictedRecruiter: userActor({ organizationId: ORG_A, id: 'rec_a', role: 'recruiter' }),
  agentForHiringManager: agentActor({ organizationId: ORG_A, onBehalfOfUserId: 'hm_a', role: 'hiring_manager' }),
  apiKeyOfRecruiter: apiKeyActor({ organizationId: ORG_A, onBehalfOfUserId: 'rec_a', role: 'recruiter' }),
};

const MEMBERS = [
  { userId: 'user_test', name: 'Olivia Owner', email: 'olivia@acme.example', roles: ['owner'] },
  { userId: 'int_a', name: 'Ivo Interviewer', email: 'ivo@acme.example', roles: ['interviewer'] },
  { userId: 'hm_a', name: 'Hugo Manager', email: 'hugo@acme.example', roles: ['hiring_manager'] },
  { userId: 'rec_a', name: 'Rita Recruiter', email: 'rita@acme.example', roles: ['recruiter'] },
];

const org = { organizationId: ORG_A };
const due = { responseDueAt: new Date('2026-06-01T12:00:00Z') };
const cv = (id: string) => ({ key: `organizations/${ORG_A}/applications/${id}/cv`, fileName: `${id}.pdf`, mediaType: 'application/pdf' as const, sizeBytes: 64 });

const APPLICATIONS = [
  buildApplication({ id: 'app_a', candidateId: 'cand_a', jobId: JOB_A, cv: cv('app_a'), ...due, ...org }),
  buildApplication({ id: 'app_b', candidateId: 'cand_b', jobId: JOB_B, cv: cv('app_b'), ...due, ...org }),
  buildApplication({ id: 'app_s1', candidateId: 'cand_s', jobId: JOB_A, cv: cv('app_s1'), ...org }),
  buildApplication({ id: 'app_s2', candidateId: 'cand_s', jobId: JOB_B, cv: cv('app_s2'), ...org }),
];

export type JobScopeWorld = TestImportDeps & TestHrDeps;

/** Everything about job B the use cases could expose: candidate, CV, notes, messages, tasks, feedback, rules, imports. */
export async function seedJobScopeWorld(): Promise<JobScopeWorld> {
  const world = seedImportWorld({
    members: { [ORG_A]: MEMBERS },
    jobs: [
      buildJob({ id: JOB_A, slug: 'backend', status: 'published', publishedAt: new Date('2026-02-01T00:00:00Z'), ...org }),
      buildJob({ id: JOB_B, slug: 'secret-b', status: 'published', publishedAt: new Date('2026-02-01T00:00:00Z'), content: completeJobContent({ title: 'Secret Bravo role' }), ...org }),
    ],
    candidates: [
      buildCandidate({ id: 'cand_a', firstName: 'Anna', lastName: 'Alpha', email: 'anna.alpha@example.org', ...org }),
      buildCandidate({ id: 'cand_b', firstName: 'Bianca', lastName: 'Bravoleak', email: 'bianca.bravoleak@example.org', tags: ['b-only'], ...org }),
      buildCandidate({ id: 'cand_s', firstName: 'Sara', lastName: 'Shared', email: 'sara.shared@example.org', ...org }),
    ],
    applications: APPLICATIONS,
    extractions: APPLICATIONS.map((a) => buildExtraction({ applicationId: a.id, ...org })),
    notes: [
      buildNote({ id: 'note_a', candidateId: 'cand_a', applicationId: 'app_a', body: 'About Anna', ...org }),
      buildNote({ id: 'note_b', candidateId: 'cand_b', applicationId: 'app_b', body: 'B-ONLY note', ...org }),
      buildNote({ id: 'note_s2', candidateId: 'cand_s', applicationId: 'app_s2', body: 'SHARED-B note on job B', ...org }),
      buildNote({ id: 'note_sx', candidateId: 'cand_s', applicationId: null, authorId: 'user_test', body: 'SHARED-B general note', ...org }),
    ],
    messaging: {
      conversations: APPLICATIONS.map((a, i) => ({ applicationId: a.id, organizationId: ORG_A, token: `token${i}`.padEnd(24, 'a') })),
      messages: APPLICATIONS.map((a) => buildMessage({ id: `msg_${a.id}`, applicationId: a.id, candidateId: a.candidateId, subject: `About ${a.id}`, status: 'sent', ...org })),
    },
    tasks: [
      buildTask({ id: 'task_b', applicationId: 'app_b', jobId: JOB_B, title: 'B-ONLY task', assigneeId: 'int_a', ...org }),
      buildTask({ id: 'task_b2', applicationId: 'app_b', jobId: JOB_B, title: 'B-ONLY task', assigneeId: 'hm_a', ...org }),
      buildTask({ id: 'task_b3', applicationId: 'app_b', jobId: JOB_B, title: 'B-ONLY task', assigneeId: 'rec_a', ...org }),
    ],
    rules: [buildAutomationRule({ id: 'rule_b', jobId: JOB_B, ...org })],
    batches: [
      {
        id: 'batch_b', organizationId: ORG_A, jobId: JOB_B, stageId: 'received', status: 'ready', createdBy: 'user_test',
        counts: { files: 1, cvs: 1, rows: 0, items: 0, included: 0, imported: 0, merged: 0, failed: 0, noEmail: 0, emailsQueued: 0, skippedReconfirmed: 0, erased: 0 },
        mapping: null, headers: [], sourceFiles: [], error: null, createdAt: new Date('2026-05-01T00:00:00Z'), importedAt: null, undoneAt: null,
      },
    ],
  });
  const hr = {
    ...world,
    hash: testHash,
    jobRequests: createInMemoryJobRequests(),
    staleJobs: createInMemoryStaleJobs(world.jobs as InMemoryJobRepository, world.store),
    distributions: createInMemoryJobDistributions(),
    distributionSettings: createInMemoryDistributionSettings(),
    registry: createDistributionRegistry([createFakeDistributionChannel()]),
    publicBaseUrl: 'https://jobs.example.org',
  };
  const deps = { ...hr, feedback: { ...hr, feedbackRequests: hr.feedbackRequests } } as unknown as JobScopeWorld;
  await seedJobB(deps);
  return deps;
}

async function seedJobB(deps: JobScopeWorld): Promise<void> {
  for (const { cv } of APPLICATIONS) if (cv) await deps.files.put(cv.key, fakePdfBytes(), 'application/pdf');
  for (const userId of ['int_a', 'hm_a', 'rec_a']) {
    await deps.jobTeams.upsert({ organizationId: ORG_A, jobId: JOB_A, userId, role: userId === 'hm_a' ? 'hiring_manager' : userId === 'int_a' ? 'interviewer' : 'recruiter', addedBy: 'system', createdAt: new Date() });
    await deps.notifications.createIfAbsent(buildNotification({ id: `notif_b_${userId}`, userId, applicationId: 'app_b', jobId: JOB_B, ...org }), `b-${userId}`);
  }
  await deps.organizationSettings.setRestrictRecruitersToTeam(ORG_A, true, new Date());
  const request = {
    id: 'fbr_b', organizationId: ORG_A, applicationId: 'app_b', jobId: JOB_B, stageId: 'stage-0', interviewerKind: 'external' as const, interviewerUserId: null,
    interviewerEmail: 'b-only@example.org', interviewerName: 'Bravoleak Panel', tokenHash: 'hash_b', expiresAt: new Date('2026-07-01T00:00:00Z'), remindersSent: 0,
    lastReminderAt: null, requestedBy: 'user_test', createdAt: new Date('2026-05-01T00:00:00Z'), submittedAt: new Date('2026-05-02T00:00:00Z'),
  };
  await deps.feedbackRequests.create(request);
  await deps.interviewFeedback.create({ id: 'fb_b', organizationId: ORG_A, applicationId: 'app_b', requestId: 'fbr_b', stageId: 'stage-0', interviewerName: 'Bravoleak Panel', answers: { strengths: 'B-ONLY answer' }, recommendation: 'proceed', submittedAt: new Date('2026-05-02T00:00:00Z') });
}

/** What one run of a use case did: refused (not found / forbidden), or returned something. */
export type ScopeOutcome = { readonly kind: 'refused'; readonly forbidden: boolean } | { readonly kind: 'returned'; readonly value: unknown };

export async function runScoped(run: () => Promise<unknown>): Promise<ScopeOutcome> {
  try {
    return { kind: 'returned', value: await run() };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) return { kind: 'refused', forbidden: error instanceof ForbiddenError };
    throw error;
  }
}

/** The markers of job B found in a value (its JSON form, bytes included). */
export function leakedMarkers(value: unknown): readonly string[] {
  const text = JSON.stringify(value, (_key, item: unknown) => (item instanceof Uint8Array ? Buffer.from(item).toString('utf8') : item)) ?? '';
  return LEAK_MARKERS.filter((marker) => text.includes(marker));
}
