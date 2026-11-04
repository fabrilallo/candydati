import type { Role } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { agentActor, apiKeyActor, userActor } from '../../testing/actors.js';
import { ORG_A } from '../../testing/candidate-seed.js';
import { seedRestrictedStageWorld } from '../../testing/restricted-stage-world.js';
import { getRestrictedStages, setStageRestriction } from './restricted-stages.js';

const user = (id: string, role: Role) => userActor({ organizationId: ORG_A, id, role });
const owner = user('user_test', 'owner');
const admin = user('admin_1', 'admin');
const manager = user('hm_1', 'hiring_manager');
const otherManager = user('hm_2', 'hiring_manager');
const recruiter = user('recruiter_1', 'recruiter');
const interviewer = user('int_1', 'interviewer');

describe('restricted stages: marking and unmarking', () => {
  it('lists the restricted stages and whether the person may change them', async () => {
    const deps = await seedRestrictedStageWorld();
    expect(await getRestrictedStages(deps, interviewer, { jobId: 'job_1' })).toEqual({ jobId: 'job_1', stageIds: ['stage-1'], canManage: false });
    expect((await getRestrictedStages(deps, recruiter, { jobId: 'job_1' })).canManage).toBe(false);
    expect((await getRestrictedStages(deps, otherManager, { jobId: 'job_1' })).canManage).toBe(false);
    for (const actor of [owner, admin, manager]) expect((await getRestrictedStages(deps, actor, { jobId: 'job_1' })).canManage).toBe(true);
  });

  it('owners, admins and the hiring manager of the job mark and unmark a stage, audited', async () => {
    for (const actor of [owner, admin, manager]) {
      const deps = await seedRestrictedStageWorld();
      expect(await setStageRestriction(deps, actor, { jobId: 'job_1', stageId: 'stage-0', restricted: true })).toEqual({ jobId: 'job_1', stageIds: ['stage-0', 'stage-1'], canManage: true, changed: true });
      expect(await setStageRestriction(deps, actor, { jobId: 'job_1', stageId: 'stage-1', restricted: false })).toMatchObject({ stageIds: ['stage-0'] });
      const events = deps.auditLog.events().filter((event) => event.action.startsWith('job.stage_'));
      expect(events.map((event) => [event.action, event.target, event.metadata])).toEqual([
        ['job.stage_restricted', { type: 'job', id: 'job_1' }, { stageId: 'stage-0' }],
        ['job.stage_unrestricted', { type: 'job', id: 'job_1' }, { stageId: 'stage-1' }],
      ]);
    }
  });

  it('records nothing when nothing changes', async () => {
    const deps = await seedRestrictedStageWorld();
    await setStageRestriction(deps, owner, { jobId: 'job_1', stageId: 'stage-1', restricted: true });
    await setStageRestriction(deps, owner, { jobId: 'job_1', stageId: 'stage-0', restricted: false });
    expect(deps.auditLog.events().filter((event) => event.action.startsWith('job.stage_'))).toEqual([]);
  });

  it('refuses recruiters, interviewers, a hiring manager who is not the job’s, API keys and the assistant', async () => {
    const deps = await seedRestrictedStageWorld();
    const input = { jobId: 'job_1', stageId: 'stage-1', restricted: false };
    for (const actor of [
      recruiter,
      interviewer,
      otherManager,
      apiKeyActor({ organizationId: ORG_A, onBehalfOfUserId: 'user_test', role: 'owner' }),
      agentActor({ organizationId: ORG_A, onBehalfOfUserId: 'hm_1', role: 'hiring_manager' }),
    ]) {
      await expect(setStageRestriction(deps, actor, input)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(deps.jobTeams.restrictedSnapshot().map((row) => row.stageId)).toEqual(['stage-1']);
  });

  it('refuses stages the job does not declare and jobs out of reach', async () => {
    const deps = await seedRestrictedStageWorld();
    await expect(setStageRestriction(deps, owner, { jobId: 'job_1', stageId: 'received', restricted: true })).rejects.toBeInstanceOf(ValidationError);
    await expect(setStageRestriction(deps, owner, { jobId: 'job_1', stageId: 'stage-9', restricted: true })).rejects.toBeInstanceOf(ValidationError);
    await expect(setStageRestriction(deps, owner, { jobId: 'nope', stageId: 'stage-0', restricted: true })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getRestrictedStages(deps, user('int_9', 'interviewer'), { jobId: 'job_1' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
