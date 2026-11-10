import { roleHasPermission, type Permission } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../actor.js';
import * as core from '../index.js';
import { ORG_A } from '../testing/candidate-seed.js';
import { ACTORS_OF_JOB_A, JOB_B, leakedMarkers, runScoped, seedJobScopeWorld, type JobScopeWorld } from '../testing/job-scope-world.js';

/**
 * Per-job access (PRODUCT.md §6), checked on every use case a job-scoped role can run. Each row runs as every actor of
 * job A (interviewer, hiring manager, restricted recruiter, the agent and an API key acting for them) against data of
 * job B. A read must be refused or return nothing of B; a write must leave B's rows exactly as they were.
 *
 * A NEW USE CASE MUST BE ADDED HERE (or to EXEMPT with the reason it carries no job or candidate data): the last test
 * fails otherwise.
 */

type Run = (deps: JobScopeWorld, actor: Actor) => Promise<unknown>;

interface Row {
  readonly useCase: string;
  readonly label?: string;
  readonly kind: 'read' | 'write';
  readonly run: Run;
  /** Markers an answer may repeat because they were in the input (a bulk result naming the ids it refused). */
  readonly echoes?: readonly string[];
  /** Extra leak check for answers that carry no marker (counts). */
  readonly leaks?: (value: never) => readonly string[];
}

const uc = core as unknown as Record<string, (deps: unknown, actor: Actor, input: unknown) => Promise<unknown>>;
const call = (name: string, input: unknown): Run => (deps, actor) => {
  const useCase = uc[name];
  if (!useCase) throw new Error(`unknown use case ${name}`);
  return useCase(deps, actor, input);
};
const read = (useCase: string, input: unknown, extra: Partial<Row> = {}): Row => ({ useCase, kind: 'read', run: call(useCase, input), ...extra });
const write = (useCase: string, input: unknown, extra: Partial<Row> = {}): Row => ({ useCase, kind: 'write', run: call(useCase, input), ...extra });

const PERIOD = { from: '2026-01-01T00:00:00Z', to: '2026-06-30T00:00:00Z' };
const MESSAGE = { subject: 'Hello', body: 'Body' };

const ROWS: readonly Row[] = [
  read('getCandidate', { candidateId: 'cand_b' }),
  read('getCandidate', { candidateId: 'cand_s' }, { label: 'shared candidate shows only job A' }),
  read('searchCandidates', {}),
  read('searchCandidates', { query: 'Bravoleak' }, { label: 'by name' }),
  read('searchCandidates', { tag: 'b-only' }, { label: 'by tag' }),
  read('getPipeline', { jobId: JOB_B }),
  read('findCandidatesByCriteria', { jobId: JOB_B, criteria: { keywords: ['Kubernetes'] } }),
  read('findCandidatesByCriteria', { jobId: 'job_1', criteria: { keywords: ['Kubernetes'] }, pool: 'both' }, { label: 'job A with the talent pool' }),
  read('openCv', { applicationId: 'app_b' }),
  read('openAttachment', { applicationId: 'app_b', attachmentId: 'att_b' }),
  read('openAttachment', { applicationId: 'app_a', attachmentId: 'att_b' }, { label: 'attachment of job B through an application of job A' }),
  read('listAttention', {}),
  read('listMessages', { applicationId: 'app_b' }),
  read('renderMessageDraft', { ...MESSAGE, applicationId: 'app_b' }),
  read('previewMessage', { ...MESSAGE, applicationId: 'app_b' }),
  read('listApplicationFeedback', { applicationId: 'app_b' }),
  read('listApplicationInterviews', { applicationId: 'app_b' }),
  read('getApplicationTimeline', { applicationId: 'app_b' }),
  read('getJobInterviewers', { jobId: JOB_B }),
  read('getJobScorecard', { jobId: JOB_B }),
  {
    useCase: 'suggestScorecardCriteria',
    kind: 'read',
    run: (deps, actor) => uc.suggestScorecardCriteria!({ ...deps, criteriaDrafter: { available: () => true, draft: async () => ({ criteria: ['Postgres'] }) } }, actor, { jobId: JOB_B }),
  },
  read('listTasks', { mine: true }),
  read('listTasks', { mine: false }, { label: 'every assignee' }),
  read('listApplicationTasks', { applicationId: 'app_b' }),
  read('listNotifications', {}),
  read('unreadNotificationCount', {}, { leaks: (value: { count: number }) => (value.count > 0 ? ['a notification about job B is counted'] : []) }),
  read('getReports', PERIOD),
  read('getReports', { ...PERIOD, jobId: JOB_B }, { label: 'one job' }),
  read('exportReportsCsv', PERIOD),
  read('getJobTraffic', { ...PERIOD, jobId: JOB_B }),
  read('getJob', { jobId: JOB_B }),
  read('listJobs', {}),
  read('getJobStats', {}, { leaks: (value: { statusCounts: { total: number } }) => (value.statusCounts.total > 1 ? ['job B is counted'] : []) }),
  read('listStaleJobs', {}),
  read('getJobDistribution', { jobId: JOB_B }),
  read('getDistributionOverview', {}),
  read('getJobApprovalStatus', { jobId: JOB_B }),
  read('getJobTeam', { jobId: JOB_B }),
  read('getRestrictedStages', { jobId: JOB_B }),
  read('listTrackedLinks', { jobId: JOB_B }),
  read('listAutomations', { jobId: JOB_B }),
  read('listMoveProposals', {}),
  read('listMoveProposals', { applicationId: 'app_b' }, { label: 'of an application of job B' }),
  read('previewAutomation', { jobId: JOB_B, stageId: 'stage-0' }),
  read('previewAutomation', { jobId: 'job_1', stageId: 'stage-0', ruleId: 'rule_b' }, { label: 'a rule of job B' }),
  read('listAutomationRuns', { ruleId: 'rule_b' }, { label: 'the runs of a rule of job B' }),
  read('listImports', {}),
  read('getImportBatch', { batchId: 'batch_b' }),
  read('exportCandidate', { candidateId: 'cand_b' }),
  read('exportCandidate', { candidateId: 'cand_s' }, { label: 'shared candidate exports only job A' }),
  {
    useCase: 'draftJobContent',
    kind: 'read',
    run: (deps, actor) => uc.draftJobContent!({ ...deps, drafter: async ({ base }: { base: unknown }) => base }, actor, { brief: 'Improve it', jobId: JOB_B }),
  },
  read('getJobClient', { jobId: JOB_B }),
  read('listClients', {}, { leaks: (value: readonly { jobCount: number }[]) => (value.some((client) => client.jobCount > 0) ? ['the job of B is counted on its client'] : []) }),
  read('listJobs', { clientId: 'client_b' }, { label: 'by client' }),
  read('getReports', { ...PERIOD, clientId: 'client_b' }, { label: 'by client' }),
  read('listJobShortlists', { jobId: JOB_B }),
  write('setJobClient', { jobId: JOB_B, clientId: null }),
  write('sendShortlist', { jobId: JOB_B, contactId: 'contact_b', candidates: [{ applicationId: 'app_b', shareCv: true }] }),
  write('revokeShortlist', { shortlistId: 'shortlist_b' }),
  write('moveApplication', { applicationId: 'app_b', stageId: 'stage-0' }),
  write('decideApplication', { applicationId: 'app_b', outcome: 'not_selected' }),
  write('updateHireDates', { applicationId: 'app_b', startOn: '2030-01-01' }),
  write('decideApplications', { applicationIds: ['app_b'], outcome: 'not_selected' }, { echoes: ['app_b'] }),
  write('updateCandidateTags', { candidateId: 'cand_b', tags: ['changed'] }),
  write('addCandidateNote', { candidateId: 'cand_b', body: 'A note' }),
  write('addCandidateNote', { candidateId: 'cand_s', applicationId: 'app_s2', body: 'A note' }, { label: 'on the job B application of a shared candidate' }),
  write('correctCandidate', { candidateId: 'cand_b', changes: { firstName: 'Changed' } }),
  write('withdrawConsent', { applicationId: 'app_b', scope: 'talent_pool' }),
  write('withdrawConsent', { applicationId: 'app_b', scope: 'selection' }, { label: 'selection' }),
  write('eraseApplication', { applicationId: 'app_b', confirmName: 'Bianca Bravoleak' }),
  write('eraseCandidate', { candidateId: 'cand_b', confirmName: 'Bianca Bravoleak' }),
  write('eraseCandidate', { candidateId: 'cand_s', confirmName: 'Sara Shared' }, { label: 'shared candidate keeps the job B application' }),
  write('sendMessage', { ...MESSAGE, applicationIds: ['app_b'] }, { echoes: ['app_b'] }),
  write('requestFeedback', { applicationId: 'app_b' }),
  write('proposeInterview', { applicationId: 'app_b', stageId: 'stage-1', mode: 'video' }),
  write('cancelInterview', { interviewId: 'int_b' }),
  write('createTask', { title: 'Call', assigneeId: 'int_a', applicationId: 'app_b' }),
  write('createTask', { title: 'Call', assigneeId: 'int_a', jobId: JOB_B }, { label: 'about the job' }),
  write('completeTask', { taskId: 'task_b' }),
  write('reopenTask', { taskId: 'task_b' }),
  write('setJobInterviewers', { jobId: JOB_B, stages: [] }),
  write('setJobScorecard', { jobId: JOB_B, criteria: [{ label: 'Changed' }] }),
  write('createAutomation', { jobId: JOB_B, stageId: 'stage-0', action: { type: 'create_task', title: 'Prepare' } }),
  write('updateAutomation', { ruleId: 'rule_b', stageId: 'stage-0', action: { type: 'create_task', title: 'Changed' } }),
  write('deleteAutomation', { ruleId: 'rule_b' }),
  write('copyAutomations', { from: { jobId: JOB_B, stageId: 'stage-0' }, to: { jobId: 'job_1', stageId: 'stage-1' } }, { label: 'from job B' }),
  write('copyAutomations', { from: { jobId: 'job_1', ruleIds: ['rule_b'] }, to: { jobId: 'job_1', stageId: 'stage-1' } }, { label: 'a rule of job B named in job A' }),
  write('copyAutomations', { from: { jobId: 'job_1', stageId: 'stage-0' }, to: { jobId: JOB_B, stageId: 'stage-1' } }, { label: 'to job B' }),
  write('attachPack', { jobId: JOB_B, packId: 'pack_a' }),
  write('createJob', { content: { title: 'New' }, automationPackIds: ['pack_a'] }, { label: 'a new job with a pack touches no rule of job B' }),
  write('confirmMoveProposal', { proposalId: 'prop_b' }),
  write('dismissMoveProposal', { proposalId: 'prop_b' }),
  write('proposeApplicationMove', { applicationId: 'app_b', toStageId: 'received', reason: 'Strong answers' }),
  write('updateJob', { jobId: JOB_B, content: { title: 'Changed' } }),
  write('duplicateStage', { jobId: JOB_B, stageId: 'stage-0' }),
  write('publishJob', { jobId: JOB_B }),
  write('closeJob', { jobId: JOB_B }),
  write('syncJobDistribution', { jobId: JOB_B }),
  write('requestJobApproval', { jobId: JOB_B, reason: 'Budget' }),
  write('addJobTeamMember', { jobId: JOB_B, userId: 'int_a', role: 'interviewer' }),
  write('removeJobTeamMember', { jobId: JOB_B, userId: 'user_test' }),
  write('setStageRestriction', { jobId: JOB_B, stageId: 'stage-0', restricted: true }),
  write('createTrackedLink', { jobId: JOB_B, source: 'linkedin' }),
  write('removeTrackedLink', { jobId: JOB_B, linkId: 'link_b' }),
  write('createImportBatch', { jobId: JOB_B, stageId: 'received', files: [{ fileName: 'cv.pdf', bytes: new Uint8Array([1]) }] }),
  write('updateImportMapping', { batchId: 'batch_b', mapping: { firstName: null, lastName: null, fullName: null, email: null, phone: null, linkedin: null, notes: null, tags: null, file: null } }),
  write('setImportItems', { batchId: 'batch_b', items: [] }),
  write('requestImportCommit', { batchId: 'batch_b' }),
  write('undoImport', { batchId: 'batch_b' }),
];

/** Use cases a job-scoped role can run that hold no job or candidate data of their own, with the reason. */
const EXEMPT: Readonly<Record<string, string>> = {
  createJob: 'creates a new job; its creator joins the team',
  listConnectedApps: 'OAuth connections (client, person, organization): account settings, no job, no candidate',
  revokeConnectedApp: 'deletes an OAuth connection and its tokens: no job, no candidate',
  recordConnectedAppGrant: 'audits an OAuth connection the person just granted: no job, no candidate',
  getInstanceEmailSettings: 'whether and how the instance sends email: no job, no candidate, never a secret',
  getMyCalendarFeed: 'the person’s own calendar link (host, hours, time zone): no job, no candidate',
  saveCalendarFeed: 'connects the person’s own calendar: no job, no candidate',
  updateCalendarPreferences: 'the person’s own working hours and time zone: no job, no candidate',
  removeCalendarFeed: 'disconnects the person’s own calendar: no job, no candidate',
  getInstanceAiSettings: 'which AI models the instance uses and whether they are on: no job, no candidate, never a key',
  getOrganizationLogo: "the organization's logo, public on its careers page: no job, no candidate",
  getSetupProgress: 'yes or no per setup step, from job counts (never a job), the notice, the careers page and the member count',
  convertJobRequest: 'creates a new job from a request; requester and converter join the team',
  submitJobRequest: 'a hiring need, not a job or candidate',
  listJobRequests: 'hiring needs of the organization, not candidate data',
  getJobRequest: 'a hiring need, not candidate data',
  createJobTemplate: 'organization template',
  deleteJobTemplate: 'organization template',
  listJobTemplates: 'organization template',
  listPacks: 'automation packs of the organization: no job, no candidate',
  createPack: 'automation packs of the organization: no job, no candidate',
  updatePack: 'automation packs of the organization: no job, no candidate',
  deletePack: 'automation packs of the organization (jobs keep their copies): no job, no candidate',
  listPackRules: 'rules of an organization pack: no job, no candidate',
  createPackRule: 'rules of an organization pack: no job, no candidate',
  updatePackRule: 'rules of an organization pack: no job, no candidate',
  deletePackRule: 'rules of an organization pack: no job, no candidate',
  listTemplatePacks: 'packs of an organization template: no job, no candidate',
  setTemplatePacks: 'packs of an organization template: no job, no candidate',
  analyzeJobAd: 'scores the content it is given, reads no stored job',
  suggestResponsibilities: 'proposes lines from the text it is given, reads no stored job',
  listEmailTemplates: 'organization template',
  saveEmailTemplate: 'organization template',
  deleteEmailTemplate: 'organization template',
  getEmailSettings: 'organization sender settings',
  getApprovalSetting: 'organization setting',
  getAccessSetting: 'organization setting',
  getAgencySetting: 'organization setting',
  getClient: 'a client of the organization (name, website, contacts): no job, no candidate',
  createClient: 'a new client of the organization: no job, no candidate',
  updateClient: 'a client of the organization: no job, no candidate',
  archiveClient: 'a client of the organization: no job, no candidate',
  getSecuritySettings: 'organization setting',
  getActivePrivacyNotice: 'public notice text',
  recordAuditEvent: 'audit hook of Better Auth',
  markNotificationsRead: 'the actor’s own notifications, returns a count',
  deliverMessage: 'system job (worker, system actor)',
  deliverWebhook: 'system job (worker, system actor)',
  runAutomations: 'system job (worker, system actor)',
  runCvExtraction: 'system job (worker, system actor)',
  runDistributionSync: 'system job (worker, system actor)',
};

/** Every row of job B, so a write that went through shows up as a difference. */
async function jobBState(deps: JobScopeWorld): Promise<string> {
  const store = deps.store.read();
  const onB = (id: string | null) => id === 'app_b' || id === 'app_s2';
  return JSON.stringify({
    applications: store.applications.filter((a) => a.jobId === JOB_B),
    candidates: store.candidates.filter((c) => c.id === 'cand_b' || c.id === 'cand_s').map((c) => ({ ...c, retentionExpiresAt: null, updatedAt: null })),
    notes: store.notes.filter((n) => n.candidateId === 'cand_b' || onB(n.applicationId)),
    extractions: store.extractions.filter((e) => onB(e.applicationId)),
    messages: deps.messagingStore.read().messages.filter((m) => onB(m.applicationId)),
    tasks: deps.tasks.snapshot().filter((t) => t.jobId === JOB_B),
    rules: deps.rules.snapshot().filter((r) => r.jobId === JOB_B),
    proposals: deps.moveProposals.snapshot().filter((p) => p.jobId === JOB_B),
    team: deps.jobTeams.snapshot().filter((m) => m.jobId === JOB_B),
    restricted: deps.jobTeams.restrictedSnapshot().filter((stage) => stage.jobId === JOB_B),
    trackedLinks: deps.trackedLinks.snapshot().filter((link) => link.jobId === JOB_B),
    clients: deps.clientStore.get(),
    interviewers: deps.feedbackStore.read().interviewers.filter((i) => i.jobId === JOB_B),
    criteria: deps.feedbackStore.read().criteria.filter((c) => c.jobId === JOB_B),
    feedback: deps.feedbackStore.read().requests.filter((r) => r.jobId === JOB_B),
    interviews: deps.interviews.all().filter((i) => i.jobId === JOB_B),
    job: await deps.jobs.findById(ORG_A, JOB_B),
    batch: deps.importStore.read().batches.filter((b) => b.jobId === JOB_B),
    files: await Promise.all(['app_b', 'app_s2'].map((id) => deps.files.get(`organizations/${ORG_A}/applications/${id}/cv`).then(() => true, () => false))),
  });
}

const rowName = (row: Row) => `${row.kind} ${row.useCase}${row.label ? ` (${row.label})` : ''}`;

describe('per-job access: nothing of job B reaches the people of job A', () => {
  it.each(ROWS.map((row) => [rowName(row), row] as const))('%s', async (_name, row) => {
    const reached: string[] = [];
    for (const [who, actor] of Object.entries(ACTORS_OF_JOB_A)) {
      const deps = await seedJobScopeWorld();
      const before = await jobBState(deps);
      const outcome = await runScoped(() => row.run(deps, actor));
      if (!(outcome.kind === 'refused' && outcome.forbidden)) reached.push(who);
      if (outcome.kind === 'returned') {
        const markers = leakedMarkers(outcome.value).filter((marker) => !(row.echoes ?? []).includes(marker));
        const extra = row.leaks ? row.leaks(outcome.value as never) : [];
        expect({ who, leaked: [...markers, ...extra] }).toEqual({ who, leaked: [] });
      }
      if (row.kind === 'write') expect({ who, unchanged: (await jobBState(deps)) === before }).toEqual({ who, unchanged: true });
    }
    // At least one actor got past the permission check: the scope, not the role, is what refused or filtered.
    expect(reached.length).toBeGreaterThan(0);
  });

  it('the same people still see job A', async () => {
    const deps = await seedJobScopeWorld();
    for (const actor of Object.values(ACTORS_OF_JOB_A)) {
      const pipeline = (await uc.getPipeline!(deps, actor, { jobId: 'job_1' })) as { cards: readonly { application: { id: string } }[] };
      expect(pipeline.cards.map((card) => card.application.id).toSorted()).toEqual(['app_a', 'app_s1']);
    }
  });

  it('covers every use case a job-scoped role can run', () => {
    const scopedRoles = ['recruiter', 'hiring_manager', 'interviewer'] as const;
    const runnable = Object.entries(uc)
      .filter(([, value]) => typeof value === 'function' && 'meta' in value)
      .filter(([, value]) => {
        const permission = (value as unknown as { meta: { permission: Permission | null } }).meta.permission;
        return permission === null || scopedRoles.some((role) => roleHasPermission(role, permission));
      })
      .map(([name]) => name);
    const covered = new Set([...ROWS.map((row) => row.useCase), ...Object.keys(EXEMPT)]);
    expect(runnable.filter((name) => !covered.has(name))).toEqual([]);
    expect([...covered].filter((name) => !runnable.includes(name))).toEqual([]);
  });
});
