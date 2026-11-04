import { MAX_STAGES, type Job, type Role } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../../actor.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import {
  agentActor,
  buildAutomationRule,
  buildJob,
  completeJobContent,
  createFeedbackStore,
  createInMemoryAutomationRules,
  createInMemoryJobRepository,
  createInMemoryMemberDirectory,
  createInMemoryScorecards,
  createInMemoryStageInterviewers,
  createTestJobDeps,
  userActor,
} from '../../testing/index.js';
import { duplicateStage, type DuplicateStageDeps } from './duplicate-stage.js';

const ORG = 'org_a';
const AT = new Date('2026-05-02T00:00:00Z');
const stage = (id: string, type: 'hr_interview' | 'technical_interview' | 'offer', extra: object = {}) => ({ id, type, durationMinutes: 60, conductedBy: 'technical_lead' as const, ...extra });
const PROCESS = [stage('stg-a', 'hr_interview'), stage('stg-b', 'technical_interview', { title: 'Tech 1', note: 'Bring a laptop' }), stage('stg-c', 'offer')];
const user = (id: string, role: Role): Actor => userActor({ organizationId: ORG, id, role });
const owner = user('user_test', 'owner');

const criterion = (id: string, stageId: string | null, position: number, extra: object = {}) => ({
  id, organizationId: ORG, jobId: 'job_1', stageId, label: `Criterion ${id}`, position, createdBy: 'hm_1', createdAt: AT, firstUsedAt: null, retiredAt: null, ...extra,
});
const interviewer = (id: string, stageId: string, userId: string) => ({ id, organizationId: ORG, jobId: 'job_1', stageId, kind: 'member' as const, userId, email: null, name: userId, createdAt: AT });

async function world(overrides: Partial<Job> = {}) {
  const job = buildJob({ organizationId: ORG, content: completeJobContent({ title: 'Dev', process: PROCESS }), ...overrides });
  const store = createFeedbackStore({
    interviewers: [interviewer('si_1', 'stg-b', 'int_1'), interviewer('si_2', 'stg-a', 'int_2')],
    criteria: [criterion('cr_1', 'stg-b', 0), criterion('cr_2', null, 1), criterion('cr_3', 'stg-b', 2), criterion('cr_old', 'stg-b', 3, { retiredAt: AT })],
  });
  const base = createTestJobDeps({
    jobs: createInMemoryJobRepository([job]),
    automationRules: createInMemoryAutomationRules([
      buildAutomationRule({ id: 'rule_1', organizationId: ORG, stageId: 'stg-b', enabled: false, createdBy: 'recruiter_1' }),
      buildAutomationRule({ id: 'rule_2', organizationId: ORG, stageId: 'stg-a' }),
    ]),
  });
  const deps: DuplicateStageDeps & typeof base = {
    ...base,
    stageInterviewers: createInMemoryStageInterviewers(store),
    scorecards: createInMemoryScorecards(store),
    members: createInMemoryMemberDirectory({ [ORG]: [] }),
  };
  await deps.jobTeams.upsert({ organizationId: ORG, jobId: job.id, userId: 'hm_1', role: 'hiring_manager', addedBy: 'system', createdAt: AT });
  await deps.jobTeams.restrictStage({ organizationId: ORG, jobId: job.id, stageId: 'stg-b', restrictedBy: 'hm_1', createdAt: AT });
  return { job, deps, store };
}

describe('duplicateStage', () => {
  it('inserts a copy right after the source with a fresh id and the same fields, keeping the other ids', async () => {
    const { deps } = await world();
    const result = await duplicateStage(deps, owner, { jobId: 'job_1', stageId: 'stg-b' });
    const process = result.job.content.process;
    expect(process.map((s) => s.id).filter((id) => id !== result.stageId)).toEqual(['stg-a', 'stg-b', 'stg-c']);
    expect(process[2]?.id).toBe(result.stageId);
    expect(result.stageId).toMatch(/^stg-[a-z0-9]+$/);
    const { id: _id, ...copy } = process[2]!;
    const { id: _source, ...source } = process[1]!;
    expect(copy).toEqual(source);
    expect((await deps.jobs.findById(ORG, 'job_1'))?.content.process).toHaveLength(4);
  });

  it('copies interviewers, stage criteria, automation rules and the restriction for an owner, as the actor', async () => {
    const { deps, store } = await world();
    const result = await duplicateStage(deps, owner, { jobId: 'job_1', stageId: 'stg-b' });
    expect(result.copied).toEqual(['interviewers', 'scorecard', 'automations', 'restriction']);
    expect(result.skipped).toEqual([]);
    const target = result.stageId;

    const copiedInterviewers = store.read().interviewers.filter((i) => i.stageId === target);
    expect(copiedInterviewers).toEqual([expect.objectContaining({ userId: 'int_1', jobId: 'job_1', organizationId: ORG })]);
    expect(copiedInterviewers[0]?.id).not.toBe('si_1');
    expect(store.read().interviewers.filter((i) => i.stageId !== target).map((i) => i.id).toSorted()).toEqual(['si_1', 'si_2']);

    const copiedCriteria = store.read().criteria.filter((c) => c.stageId === target);
    expect(copiedCriteria.map((c) => [c.label, c.position, c.createdBy, c.firstUsedAt])).toEqual([
      ['Criterion cr_1', 4, 'user_test', null],
      ['Criterion cr_3', 5, 'user_test', null],
    ]);

    const rules = await deps.automationRules.listByJob(ORG, 'job_1');
    const copiedRule = rules.find((rule) => rule.stageId === target);
    expect(copiedRule).toMatchObject({ action: buildAutomationRule().action, enabled: false, createdBy: 'user_test' });
    expect(copiedRule?.id).not.toBe('rule_1');
    expect(rules).toHaveLength(3);

    const restricted = (await deps.jobTeams.listRestrictedStages(ORG, 'job_1')).map((s) => s.stageId).toSorted();
    expect(restricted).toEqual(['stg-b', target].toSorted());
  });

  it('copies nothing that the source stage does not have', async () => {
    const { deps } = await world();
    const result = await duplicateStage(deps, owner, { jobId: 'job_1', stageId: 'stg-c' });
    expect(result.copied).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('skips what the actor may not manage instead of failing: a hiring manager has no automation rules', async () => {
    const { deps } = await world();
    const result = await duplicateStage(deps, user('hm_1', 'hiring_manager'), { jobId: 'job_1', stageId: 'stg-b' });
    expect(result.copied).toEqual(['interviewers', 'scorecard', 'restriction']);
    expect(result.skipped).toEqual(['automations']);
    expect((await deps.automationRules.listByJob(ORG, 'job_1')).filter((rule) => rule.stageId === result.stageId)).toEqual([]);
  });

  it('skips the restriction for a recruiter, who does not decide who reads what', async () => {
    const { deps } = await world();
    const recruiter = user('user_test', 'recruiter');
    const result = await duplicateStage(deps, recruiter, { jobId: 'job_1', stageId: 'stg-b' });
    expect(result.skipped).toEqual(['restriction']);
    expect((await deps.jobTeams.listRestrictedStages(ORG, 'job_1')).map((s) => s.stageId)).toEqual(['stg-b']);
  });

  it('audits one job.stage_duplicated event with ids and kinds only', async () => {
    const { deps } = await world();
    const result = await duplicateStage(deps, user('hm_1', 'hiring_manager'), { jobId: 'job_1', stageId: 'stg-b' });
    const event = deps.auditLog.events().find((e) => e.action === 'job.stage_duplicated');
    expect(event).toMatchObject({
      target: { type: 'job', id: 'job_1' },
      metadata: { sourceStageId: 'stg-b', stageId: result.stageId, copied: ['interviewers', 'scorecard', 'restriction'], skipped: ['automations'] },
    });
  });

  it('refuses an unknown stage, received included, and changes nothing', async () => {
    const { deps } = await world();
    for (const stageId of ['nope', 'received']) {
      const error = await duplicateStage(deps, owner, { jobId: 'job_1', stageId }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).issues).toEqual([{ path: 'stageId', message: 'unknown_stage' }]);
    }
    expect((await deps.jobs.findById(ORG, 'job_1'))?.content.process).toHaveLength(3);
    expect(deps.auditLog.events()).toEqual([]);
  });

  it('refuses a process that is already at the maximum number of stages', async () => {
    const full = Array.from({ length: MAX_STAGES }, (_, i) => stage(`stg-${i}`, 'hr_interview'));
    const { deps } = await world({ content: completeJobContent({ title: 'Dev', process: full }) });
    const error = await duplicateStage(deps, owner, { jobId: 'job_1', stageId: 'stg-0' }).catch((e: unknown) => e);
    expect((error as ValidationError).issues).toEqual([{ path: 'process', message: 'too_many_stages' }]);
  });

  it('hides a job of another organization, and refuses the same id asked from another organization', async () => {
    const { deps } = await world({ organizationId: 'org_b' });
    await expect(duplicateStage(deps, owner, { jobId: 'job_1', stageId: 'stg-b' })).rejects.toBeInstanceOf(NotFoundError);
    const other = await world();
    await expect(duplicateStage(other.deps, userActor({ organizationId: 'org_b' }), { jobId: 'job_1', stageId: 'stg-b' })).rejects.toBeInstanceOf(NotFoundError);
    expect(other.deps.auditLog.events()).toEqual([]);
  });

  it('follows the rules of updateJob: no interviewer, no closed job, the assistant on drafts only', async () => {
    const { deps } = await world();
    await expect(duplicateStage(deps, user('int_1', 'interviewer'), { jobId: 'job_1', stageId: 'stg-b' })).rejects.toBeInstanceOf(ForbiddenError);
    const closed = await world({ status: 'closed' });
    await expect(duplicateStage(closed.deps, owner, { jobId: 'job_1', stageId: 'stg-b' })).rejects.toBeInstanceOf(ConflictError);
    const live = await world({ status: 'published', publishedAt: AT });
    const assistant = agentActor({ organizationId: ORG, role: 'owner', onBehalfOfUserId: 'user_test' });
    await expect(duplicateStage(live.deps, assistant, { jobId: 'job_1', stageId: 'stg-b' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('keeps the ids of legacy stages saved without one, so their candidates do not move', async () => {
    const legacy = [{ type: 'hr_interview' as const, durationMinutes: 30, conductedBy: 'recruiter' as const }, { type: 'offer' as const, durationMinutes: 30, conductedBy: 'recruiter' as const }];
    const { deps } = await world({ content: { ...completeJobContent({ title: 'Dev' }), process: legacy } });
    const result = await duplicateStage(deps, owner, { jobId: 'job_1', stageId: 'stage-0' });
    expect(result.job.content.process.map((s) => s.id)).toEqual(['stage-0', result.stageId, 'stage-1']);
  });

  it('rolls everything back when a copy fails', async () => {
    const { deps } = await world();
    const failing = { ...deps, scorecards: { ...deps.scorecards, create: async () => Promise.reject(new Error('boom')) } };
    await expect(duplicateStage(failing, owner, { jobId: 'job_1', stageId: 'stg-b' })).rejects.toThrow('boom');
    expect((await deps.jobs.findById(ORG, 'job_1'))?.content.process).toHaveLength(3);
    expect(deps.auditLog.events()).toEqual([]);
  });
});
