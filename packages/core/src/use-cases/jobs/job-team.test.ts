import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { agentActor, apiKeyActor, userActor } from '../../testing/actors.js';
import { ORG_A } from '../../testing/candidate-seed.js';
import { createInMemoryJobTeams } from '../../testing/in-memory-job-teams.js';
import { seedHrWorld } from '../../testing/hr-deps.js';
import { createJob } from './create-job.js';
import { addJobTeamMember, getJobTeam, removeJobTeamMember } from './job-team.js';
import { getAccessSetting, setAccessSetting } from './access-setting.js';
import { getJob } from './get-job.js';

const owner = userActor({ organizationId: ORG_A, id: 'user_test', role: 'owner' });
const manager = userActor({ organizationId: ORG_A, id: 'hm_1', role: 'hiring_manager' });
const interviewer = userActor({ organizationId: ORG_A, id: 'int_1', role: 'interviewer' });
const recruiter = userActor({ organizationId: ORG_A, id: 'recruiter_1', role: 'recruiter' });

const MEMBERS = {
  [ORG_A]: [
    { userId: 'user_test', name: 'Olivia Owner', email: 'olivia@acme.example', roles: ['owner'] },
    { userId: 'recruiter_1', name: 'Rita Recruiter', email: 'rita@acme.example', roles: ['recruiter'] },
    { userId: 'hm_1', name: 'Hugo Manager', email: 'hugo@acme.example', roles: ['hiring_manager'] },
    { userId: 'int_1', name: 'Ivo Interviewer', email: 'ivo@acme.example', roles: ['interviewer'] },
  ],
};

const world = () => seedHrWorld({ members: MEMBERS });

describe('job team', () => {
  it('adds and removes members; the job becomes visible to them and then disappears again', async () => {
    const deps = world();
    await expect(getJob(deps, interviewer, { jobId: 'job_1' })).rejects.toBeInstanceOf(NotFoundError);
    await addJobTeamMember(deps, owner, { jobId: 'job_1', userId: 'int_1', role: 'interviewer' });
    expect((await getJob(deps, interviewer, { jobId: 'job_1' })).id).toBe('job_1');
    const team = await getJobTeam(deps, interviewer, { jobId: 'job_1' });
    expect(team.members.map((m) => [m.userId, m.role, m.source])).toContainEqual(['int_1', 'interviewer', 'team']);
    expect(deps.auditLog.events().map((e) => e.action)).toContain('job.team_member_added');
    expect(await removeJobTeamMember(deps, owner, { jobId: 'job_1', userId: 'int_1' })).toEqual({ removed: true });
    await expect(getJob(deps, interviewer, { jobId: 'job_1' })).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.auditLog.events().map((e) => e.action)).toContain('job.team_member_removed');
  });

  it('changes the role of someone already on the team instead of adding them twice', async () => {
    const deps = world();
    await addJobTeamMember(deps, owner, { jobId: 'job_1', userId: 'hm_1', role: 'interviewer' });
    await addJobTeamMember(deps, owner, { jobId: 'job_1', userId: 'hm_1', role: 'hiring_manager' });
    const team = await getJobTeam(deps, owner, { jobId: 'job_1' });
    expect(team.members.filter((m) => m.userId === 'hm_1').map((m) => m.role)).toEqual(['hiring_manager']);
  });

  it('lists stage interviewers as members that come from the stage', async () => {
    const deps = world();
    await deps.stageInterviewers.replaceForJob(ORG_A, 'job_1', [
      { id: 'si_1', organizationId: ORG_A, jobId: 'job_1', stageId: 'stage-0', kind: 'member', userId: 'int_1', email: null, name: 'Ivo Interviewer', createdAt: new Date() },
    ]);
    const team = await getJobTeam(deps, interviewer, { jobId: 'job_1' });
    expect(team.members).toContainEqual(expect.objectContaining({ userId: 'int_1', source: 'stage_interviewer', stageIds: ['stage-0'], removable: false }));
  });

  it('refuses people who are not members of the organization', async () => {
    const deps = world();
    await expect(addJobTeamMember(deps, owner, { jobId: 'job_1', userId: 'stranger', role: 'interviewer' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('lets a hiring manager manage only the teams they are on, and never an interviewer or a machine', async () => {
    const deps = world();
    await expect(addJobTeamMember(deps, manager, { jobId: 'job_1', userId: 'int_1', role: 'interviewer' })).rejects.toBeInstanceOf(NotFoundError);
    await addJobTeamMember(deps, owner, { jobId: 'job_1', userId: 'hm_1', role: 'hiring_manager' });
    await addJobTeamMember(deps, manager, { jobId: 'job_1', userId: 'int_1', role: 'interviewer' });
    await expect(removeJobTeamMember(deps, interviewer, { jobId: 'job_1', userId: 'hm_1' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addJobTeamMember(deps, apiKeyActor({ organizationId: ORG_A }), { jobId: 'job_1', userId: 'int_1', role: 'interviewer' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addJobTeamMember(deps, agentActor({ organizationId: ORG_A }), { jobId: 'job_1', userId: 'int_1', role: 'interviewer' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('puts the creator of a job on its team, so a hiring manager keeps seeing the ad they wrote', async () => {
    const deps = world();
    const job = await createJob(deps, manager, { content: { title: 'Data analyst' } });
    expect((await getJob(deps, manager, { jobId: job.id })).id).toBe(job.id);
    const team = await getJobTeam(deps, manager, { jobId: job.id });
    expect(team.members).toContainEqual(expect.objectContaining({ userId: 'hm_1', role: 'hiring_manager', source: 'team' }));
  });

  it('fails closed when a job-scoped actor runs without job teams', async () => {
    const deps = { ...world(), jobTeams: undefined };
    await expect(getJob(deps, interviewer, { jobId: 'job_1' })).rejects.toThrow(/jobTeams is required/);
    expect((await getJob(deps, owner, { jobId: 'job_1' })).id).toBe('job_1');
  });
});

describe('recruiter access setting', () => {
  it('is off by default: recruiters see every job; on: only the jobs of their teams', async () => {
    const deps = world();
    expect(await getAccessSetting(deps, recruiter, {})).toEqual({ restrictRecruitersToTeam: false });
    expect((await getJob(deps, recruiter, { jobId: 'job_1' })).id).toBe('job_1');
    await setAccessSetting(deps, owner, { restrictRecruitersToTeam: true });
    await expect(getJob(deps, recruiter, { jobId: 'job_1' })).rejects.toBeInstanceOf(NotFoundError);
    await addJobTeamMember(deps, owner, { jobId: 'job_1', userId: 'recruiter_1', role: 'recruiter' });
    expect((await getJob(deps, recruiter, { jobId: 'job_1' })).id).toBe('job_1');
    expect(deps.auditLog.events().map((e) => e.action)).toContain('organization.access_setting_updated');
  });

  it('can be changed only by owners and admins', async () => {
    const deps = world();
    await expect(setAccessSetting(deps, recruiter, { restrictRecruitersToTeam: true })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('reads the same teams through a fresh repository (rows are shared)', async () => {
    const teams = createInMemoryJobTeams();
    await teams.upsert({ organizationId: ORG_A, jobId: 'j', userId: 'u', role: 'interviewer', addedBy: 'x', createdAt: new Date() });
    expect(await teams.withSources({}).jobIdsOf(ORG_A, 'u')).toEqual(['j']);
  });
});
