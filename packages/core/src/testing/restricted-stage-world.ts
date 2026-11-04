import type { Actor } from '../actor.js';
import { agentActor, apiKeyActor, userActor } from './actors.js';
import { buildApplication, buildNote } from './candidate-fixtures.js';
import { ORG_A } from './candidate-seed.js';
import { seedHrWorld, type TestHrDeps } from './hr-deps.js';

/**
 * Job `job_1` with `stage-1` restricted (PRODUCT.md §6.2). Application `app_1` has notes and feedback at the open
 * `stage-0` and at the restricted `stage-1`. Each text carries a marker, so a test can tell what a person was shown.
 */
export const OPEN_MARKERS = ['OPEN-NOTE', 'OPEN-FEEDBACK'] as const;
export const RESTRICTED_MARKERS = ['RESTRICTED-NOTE-HM', 'RESTRICTED-NOTE-INT2', 'RESTRICTED-FEEDBACK-INT2', 'RESTRICTED-FEEDBACK-EXT', 'Restricted Panel'] as const;
export const ALL_MARKERS = [...OPEN_MARKERS, ...RESTRICTED_MARKERS] as const;
/** What the interviewer `int_2` wrote at the restricted stage: they read their own words. */
export const INT2_OWN = ['RESTRICTED-NOTE-INT2', 'RESTRICTED-FEEDBACK-INT2'] as const;

const MEMBERS = [
  { userId: 'user_test', name: 'Olivia Owner', email: 'olivia@acme.example', roles: ['owner'] },
  { userId: 'admin_1', name: 'Adam Admin', email: 'adam@acme.example', roles: ['admin'] },
  { userId: 'recruiter_1', name: 'Rita Recruiter', email: 'rita@acme.example', roles: ['recruiter'] },
  { userId: 'hm_1', name: 'Hugo Manager', email: 'hugo@acme.example', roles: ['hiring_manager'] },
  { userId: 'hm_2', name: 'Hanna Helper', email: 'hanna@acme.example', roles: ['hiring_manager'] },
  { userId: 'int_1', name: 'Ivo Interviewer', email: 'ivo@acme.example', roles: ['interviewer'] },
  { userId: 'int_2', name: 'Irene Interviewer', email: 'irene@acme.example', roles: ['interviewer'] },
];

const user = (id: string, role: Actor['role']) => userActor({ organizationId: ORG_A, id, role });

/** Every role, and the assistant and API keys acting for some of them, with what each one must be shown. */
export const RESTRICTED_STAGE_ACTORS: readonly { readonly who: string; readonly actor: Actor; readonly sees: readonly string[] }[] = [
  { who: 'owner', actor: user('user_test', 'owner'), sees: ALL_MARKERS },
  { who: 'admin', actor: user('admin_1', 'admin'), sees: ALL_MARKERS },
  { who: 'hiring manager of the job', actor: user('hm_1', 'hiring_manager'), sees: ALL_MARKERS },
  { who: 'assistant for the hiring manager', actor: agentActor({ organizationId: ORG_A, onBehalfOfUserId: 'hm_1', role: 'hiring_manager' }), sees: ALL_MARKERS },
  { who: 'API key of the hiring manager', actor: apiKeyActor({ organizationId: ORG_A, onBehalfOfUserId: 'hm_1', role: 'hiring_manager' }), sees: ALL_MARKERS },
  { who: 'API key of the owner', actor: apiKeyActor({ organizationId: ORG_A, onBehalfOfUserId: 'user_test', role: 'owner' }), sees: ALL_MARKERS },
  { who: 'recruiter', actor: user('recruiter_1', 'recruiter'), sees: OPEN_MARKERS },
  { who: 'API key of the recruiter', actor: apiKeyActor({ organizationId: ORG_A, onBehalfOfUserId: 'recruiter_1', role: 'recruiter' }), sees: OPEN_MARKERS },
  { who: 'assistant for the recruiter', actor: agentActor({ organizationId: ORG_A, onBehalfOfUserId: 'recruiter_1', role: 'recruiter' }), sees: OPEN_MARKERS },
  { who: 'hiring manager on the team as interviewer', actor: user('hm_2', 'hiring_manager'), sees: OPEN_MARKERS },
  { who: 'interviewer', actor: user('int_1', 'interviewer'), sees: OPEN_MARKERS },
  { who: 'interviewer who wrote at the stage', actor: user('int_2', 'interviewer'), sees: [...OPEN_MARKERS, ...INT2_OWN] },
  { who: 'assistant for the interviewer who wrote', actor: agentActor({ organizationId: ORG_A, onBehalfOfUserId: 'int_2', role: 'interviewer' }), sees: [...OPEN_MARKERS, ...INT2_OWN] },
];

const AT = new Date('2026-05-02T00:00:00Z');
const EXPIRES = new Date('2026-07-01T00:00:00Z');

const request = (id: string, stageId: string, interviewer: { userId: string | null; name: string; email: string }) => ({
  id, organizationId: ORG_A, applicationId: 'app_1', jobId: 'job_1', stageId, interviewerKind: interviewer.userId === null ? ('external' as const) : ('member' as const),
  interviewerUserId: interviewer.userId, interviewerEmail: interviewer.email, interviewerName: interviewer.name, tokenHash: `hash_${id}`, expiresAt: EXPIRES,
  remindersSent: 0, lastReminderAt: null, requestedBy: 'hm_1', createdAt: AT, submittedAt: AT,
});

const feedback = (id: string, requestId: string, stageId: string, interviewerName: string, text: string) => ({
  id, organizationId: ORG_A, applicationId: 'app_1', requestId, stageId, interviewerName, answers: { hr_motivation: text, hr_logistics: text, tech_shown: text }, recommendation: 'proceed' as const, observations: [{ criterionId: 'crit_1', label: 'Postgres experience', observation: 'observed' as const, evidence: text }], submittedAt: AT,
});

async function seedFeedback(deps: TestHrDeps): Promise<void> {
  const rows = [
    { req: request('fbr_open', 'stage-0', { userId: 'recruiter_1', name: 'Rita Recruiter', email: 'rita@acme.example' }), text: 'OPEN-FEEDBACK' },
    { req: request('fbr_int2', 'stage-1', { userId: 'int_2', name: 'Irene Interviewer', email: 'irene@acme.example' }), text: 'RESTRICTED-FEEDBACK-INT2' },
    { req: request('fbr_ext', 'stage-1', { userId: null, name: 'Restricted Panel', email: 'panel@partner.example' }), text: 'RESTRICTED-FEEDBACK-EXT' },
  ];
  for (const { req, text } of rows) {
    await deps.feedbackRequests.create(req);
    await deps.interviewFeedback.create(feedback(`fb_${req.id}`, req.id, req.stageId, req.interviewerName, text));
  }
}

export async function seedRestrictedStageWorld(): Promise<TestHrDeps> {
  const deps = seedHrWorld({
    members: { [ORG_A]: MEMBERS },
    applications: [buildApplication({ organizationId: ORG_A, stageId: 'stage-1' })],
    notes: [
      buildNote({ id: 'note_open', organizationId: ORG_A, applicationId: 'app_1', stageId: 'stage-0', authorId: 'recruiter_1', body: 'OPEN-NOTE' }),
      buildNote({ id: 'note_hm', organizationId: ORG_A, applicationId: 'app_1', stageId: 'stage-1', authorId: 'hm_1', body: 'RESTRICTED-NOTE-HM' }),
      buildNote({ id: 'note_int2', organizationId: ORG_A, applicationId: 'app_1', stageId: 'stage-1', authorId: 'int_2', body: 'RESTRICTED-NOTE-INT2' }),
    ],
  });
  const team = [
    ['hm_1', 'hiring_manager'],
    ['hm_2', 'interviewer'],
    ['int_1', 'interviewer'],
  ] as const;
  for (const [userId, role] of team) await deps.jobTeams.upsert({ organizationId: ORG_A, jobId: 'job_1', userId, role, addedBy: 'system', createdAt: AT });
  await deps.stageInterviewers.replaceForJob(ORG_A, 'job_1', [
    { id: 'si_int2', organizationId: ORG_A, jobId: 'job_1', stageId: 'stage-1', kind: 'member', userId: 'int_2', email: null, name: 'Irene Interviewer', createdAt: AT },
  ]);
  await deps.jobTeams.restrictStage({ organizationId: ORG_A, jobId: 'job_1', stageId: 'stage-1', restrictedBy: 'hm_1', createdAt: AT });
  await seedFeedback(deps);
  return deps;
}

/** The markers found in a value. */
export const markersIn = (value: unknown): readonly string[] => {
  const text = JSON.stringify(value) ?? '';
  return ALL_MARKERS.filter((marker) => text.includes(marker));
};
