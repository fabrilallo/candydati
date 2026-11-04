import type { AutomationAction } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { buildApplication, buildAutomationRule, buildCandidate, buildMoveProposal, defaultMembers, seedHrWorld, systemActor, ORG_A } from '../../testing/index.js';
import type { Member } from '../../automation-ports.js';
import { runAutomations } from './run-automations.js';

const worker = systemActor({ organizationId: ORG_A });
const input = { organizationId: ORG_A, applicationId: 'app_1', stageId: 'stage-0' };

const world = (action: AutomationAction, options: { readonly members?: readonly Member[]; readonly createdBy?: string; readonly tags?: readonly string[] } = {}) =>
  seedHrWorld({
    candidates: [buildCandidate({ organizationId: ORG_A, tags: [...(options.tags ?? [])] })],
    applications: [buildApplication({ organizationId: ORG_A, stageId: 'stage-0' })],
    rules: [buildAutomationRule({ action, createdBy: options.createdBy ?? 'recruiter_1' })],
    members: { [ORG_A]: options.members ?? defaultMembers },
  });

const interviewer = { id: 'si_1', organizationId: ORG_A, jobId: 'job_1', stageId: 'stage-0', kind: 'member' as const, userId: 'hm_1', email: null, name: 'Hugo Manager', createdAt: new Date('2026-01-01T00:00:00Z') };

describe('runAutomations: add_tag', () => {
  it('adds the tag once', async () => {
    const deps = world({ type: 'add_tag', tag: 'fast-track' }, { tags: ['senior'] });
    expect(await runAutomations(deps, worker, input)).toMatchObject({ executed: 1, failed: 0 });
    expect((await deps.candidates.findById(ORG_A, 'cand_1'))?.tags).toEqual(['senior', 'fast-track']);
    await runAutomations(deps, worker, { ...input, trigger: 'candidate_replied', occurrence: 'message:m1' });
    expect((await deps.candidates.findById(ORG_A, 'cand_1'))?.tags).toEqual(['senior', 'fast-track']);
  });

  it('fails, and tells the creator, when the profile has no room left', async () => {
    const deps = world({ type: 'add_tag', tag: 'one-more' }, { tags: Array.from({ length: 20 }, (_, i) => `t${i}`) });
    expect(await runAutomations(deps, worker, input)).toMatchObject({ executed: 0, failed: 1 });
    expect(deps.notifications.snapshot().map((n) => [n.kind, n.userId])).toEqual([['automation_failed', 'recruiter_1']]);
  });
});

describe('runAutomations: assign', () => {
  it('gives the job owner a "follow this application" task, never two open at once', async () => {
    const deps = world({ type: 'assign', assignee: 'job_owner', dueInDays: 2 });
    await runAutomations(deps, worker, input);
    await runAutomations(deps, worker, { ...input, trigger: 'candidate_replied', occurrence: 'message:m1' });
    const tasks = deps.tasks.snapshot();
    expect(tasks.map((t) => [t.title, t.assigneeId, t.createdBy])).toEqual([['Segui questa candidatura', 'user_test', 'recruiter_1']]);
    expect(tasks[0]?.dueAt).not.toBeNull();
    expect(deps.notifications.snapshot().map((n) => n.kind)).toEqual(['task_assigned']);
  });
});

describe('runAutomations: request_feedback', () => {
  it('asks the interviewers of the stage, and nobody twice', async () => {
    const deps = world({ type: 'request_feedback' });
    await deps.stageInterviewers.replaceForJob(ORG_A, 'job_1', [interviewer]);
    expect(await runAutomations(deps, worker, input)).toMatchObject({ executed: 1 });
    await runAutomations(deps, worker, { ...input, trigger: 'candidate_replied', occurrence: 'message:m1' });
    const requests = await deps.feedbackRequests.listByApplication(ORG_A, 'app_1');
    expect(requests.map((r) => [r.interviewerUserId, r.stageId, r.requestedBy])).toEqual([['hm_1', 'stage-0', 'recruiter_1']]);
  });

  it('fails when the stage has no interviewer, so the creator can fix the rule', async () => {
    const deps = world({ type: 'request_feedback' });
    expect(await runAutomations(deps, worker, input)).toMatchObject({ executed: 0, failed: 1 });
  });
});

describe('runAutomations: notify', () => {
  it('in app: a notification for each recipient who can open the job, ids only', async () => {
    const deps = world({ type: 'notify', channel: 'in_app', recipients: ['job_owner', 'hm_1', 'gone'] });
    await deps.jobTeams.upsert({ organizationId: ORG_A, jobId: 'job_1', userId: 'hm_1', role: 'hiring_manager', addedBy: 'system', createdAt: new Date() });
    expect(await runAutomations(deps, worker, input)).toMatchObject({ executed: 1 });
    const sent = deps.notifications.snapshot();
    expect(sent.map((n) => [n.kind, n.userId])).toEqual([['automation_alert', 'user_test'], ['automation_alert', 'hm_1']]);
    expect(sent[0]?.payload).toEqual({ ruleId: 'rule_1', stageId: 'stage-0', trigger: 'stage_entered' });
  });

  it('email: the notification is one the hourly digest carries', async () => {
    const deps = world({ type: 'notify', channel: 'email', recipients: ['admin_1'] });
    await runAutomations(deps, worker, input);
    expect(deps.notifications.snapshot().map((n) => [n.kind, n.userId])).toEqual([['automation_alert_email', 'admin_1']]);
  });

  it('skips people who cannot open the job; nobody left is a failure', async () => {
    const deps = world({ type: 'notify', channel: 'in_app', recipients: ['hm_1'] });
    expect(await runAutomations(deps, worker, input)).toMatchObject({ executed: 0, failed: 1 });
    expect(deps.notifications.snapshot().map((n) => n.kind)).toEqual(['automation_failed']);
  });

  it('webhook: an automation.notified event with ids only', async () => {
    const deps = world({ type: 'notify', channel: 'webhook', recipients: [] });
    await runAutomations(deps, worker, input);
    const events = deps.outbox.snapshot().filter((e) => e.type === 'automation.notified');
    expect(events.map((e) => e.data)).toEqual([{ ruleId: 'rule_1', applicationId: 'app_1', jobId: 'job_1', stageId: 'stage-0', trigger: 'stage_entered' }]);
  });
});

describe('runAutomations: propose_move', () => {
  it('writes a proposal and moves nothing (PRODUCT.md §2.4)', async () => {
    const deps = world({ type: 'propose_move', toStageId: 'stage-1' });
    expect(await runAutomations(deps, worker, input)).toMatchObject({ executed: 1 });
    expect((await deps.applications.findById(ORG_A, 'app_1'))?.stageId).toBe('stage-0');
    expect(deps.moveProposals.snapshot().map((p) => [p.status, p.fromStageId, p.toStageId, p.proposedBy, p.ruleId])).toEqual([['open', 'stage-0', 'stage-1', 'recruiter_1', 'rule_1']]);
    expect(deps.notifications.snapshot().map((n) => [n.kind, n.userId]).toSorted()).toEqual([['move_proposed', 'recruiter_1'], ['move_proposed', 'user_test']]);
  });

  it('keeps the open proposal an application already has', async () => {
    const deps = world({ type: 'propose_move', toStageId: 'stage-1' });
    await deps.moveProposals.createIfNoneOpen(buildMoveProposal({ id: 'earlier', toStageId: 'stage-0' }));
    expect(await runAutomations(deps, worker, input)).toMatchObject({ executed: 1 });
    expect(deps.moveProposals.snapshot().map((p) => p.id)).toEqual(['earlier']);
  });

  it('fails when the target stage was removed from the job', async () => {
    const deps = world({ type: 'propose_move', toStageId: 'stage-9' });
    expect(await runAutomations(deps, worker, input)).toMatchObject({ failed: 1 });
    expect(deps.moveProposals.snapshot()).toEqual([]);
  });
});

describe('runAutomations: the creator is checked again when the rule runs', () => {
  it('a creator who lost the permission the action needs: skipped, admins told', async () => {
    const members = defaultMembers.map((m) => (m.userId === 'recruiter_1' ? { ...m, roles: ['interviewer'] } : m));
    const deps = world({ type: 'propose_move', toStageId: 'stage-1' }, { members });
    expect(await runAutomations(deps, worker, input)).toMatchObject({ executed: 0, failed: 1 });
    expect(deps.moveProposals.snapshot()).toEqual([]);
    expect(deps.notifications.snapshot().map((n) => n.payload.reason)).toContain('creator_not_authorized');
  });

  it('a recruiter restricted to their teams who left the job team: skipped', async () => {
    const deps = world({ type: 'add_tag', tag: 'x' });
    await deps.organizationSettings.setRestrictRecruitersToTeam(ORG_A, true, new Date());
    expect(await runAutomations(deps, worker, input)).toMatchObject({ executed: 0, failed: 1 });
    expect((await deps.candidates.findById(ORG_A, 'cand_1'))?.tags).toEqual([]);
    const onTeam = world({ type: 'add_tag', tag: 'x' });
    await onTeam.organizationSettings.setRestrictRecruitersToTeam(ORG_A, true, new Date());
    await onTeam.jobTeams.upsert({ organizationId: ORG_A, jobId: 'job_1', userId: 'recruiter_1', role: 'recruiter', addedBy: 'system', createdAt: new Date() });
    expect(await runAutomations(onTeam, worker, input)).toMatchObject({ executed: 1 });
  });
});
