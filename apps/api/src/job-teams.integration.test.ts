import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, personForm, publishJob, userIdOf, type World } from './testing/candidate-world.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

interface Card {
  id: string;
  candidate: { id: string };
}
interface Team {
  members: { userId: string; role: string; source: string; removable: boolean }[];
}

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

/** Two published jobs with one application each: A is the world's job, B a second one. */
async function twoJobs(w: World) {
  const jobB = await publishJob(w.owner, 'Secret role');
  await w.submit(personForm({ email: uniqueEmail('anna') }));
  await w.submit(personForm({ email: uniqueEmail('bruno'), firstName: 'Bruno' }), { job: jobB });
  const card = async (jobId: string) => (await w.owner.get<{ applications: Card[] }>(`/api/v1/jobs/${jobId}/pipeline`)).body.data!.applications[0]!;
  return { jobB, cardA: await card(w.job.id), cardB: await card(jobB.id) };
}

describe('per-job access over HTTP', () => {
  it('lets an interviewer of job A open its candidates and answers 404 for everything of job B', async () => {
    const w = await createWorld(t);
    const { jobB, cardA, cardB } = await twoJobs(w);
    const interviewer = await w.member('interviewer');
    await w.joinTeam(interviewer, 'interviewer');

    expect((await interviewer.get(`/api/v1/candidates/${cardA.candidate.id}`)).status).toBe(200);
    expect((await interviewer.get(`/api/v1/candidates/${cardB.candidate.id}`)).status).toBe(404);
    expect((await interviewer.get(`/api/v1/applications/${cardB.id}/cv`)).status).toBe(404);
    expect((await interviewer.get(`/api/v1/applications/${cardB.id}/messages`)).status).toBe(404);
    expect((await interviewer.get(`/api/v1/jobs/${jobB.id}/pipeline`)).status).toBe(404);
    expect((await interviewer.get(`/api/v1/jobs/${jobB.id}`)).status).toBe(404);
    const listed = (await interviewer.get<{ id: string }[]>('/api/v1/candidates')).body.data!.map((row) => row.id);
    expect(listed).toEqual([cardA.candidate.id]);
    const jobs = (await interviewer.get<{ id: string }[]>('/api/v1/jobs')).body.data!.map((job) => job.id);
    expect(jobs).toEqual([w.job.id]);
  });

  it('adds, changes and removes members; only a person with job_team:manage on the job does it', async () => {
    const w = await createWorld(t);
    const [hm, interviewer] = [await w.member('hiring_manager'), await w.member('interviewer')];
    const interviewerId = await userIdOf(interviewer);
    expect((await hm.put(`/api/v1/jobs/${w.job.id}/team/${interviewerId}`, { role: 'interviewer' })).status).toBe(404);
    await w.joinTeam(hm, 'hiring_manager');
    const added = await hm.put<Team>(`/api/v1/jobs/${w.job.id}/team/${interviewerId}`, { role: 'interviewer' });
    expect(added.status).toBe(200);
    expect(added.body.data!.members).toContainEqual(expect.objectContaining({ userId: interviewerId, role: 'interviewer', source: 'team', removable: true }));
    expect((await interviewer.put(`/api/v1/jobs/${w.job.id}/team/${await userIdOf(hm)}`, { role: 'interviewer' })).status).toBe(403);
    expect((await w.owner.put(`/api/v1/jobs/${w.job.id}/team/nobody`, { role: 'interviewer' })).status).toBe(422);
    expect((await interviewer.get<Team>(`/api/v1/jobs/${w.job.id}/team`)).status).toBe(200);
    expect((await hm.delete(`/api/v1/jobs/${w.job.id}/team/${interviewerId}`)).body.data).toEqual({ removed: true });
    expect((await interviewer.get(`/api/v1/jobs/${w.job.id}/team`)).status).toBe(404);
  });

  it('restricts recruiters to their teams only when the organization says so', async () => {
    const w = await createWorld(t);
    const recruiter = await w.member('recruiter');
    expect((await recruiter.get(`/api/v1/jobs/${w.job.id}`)).status).toBe(200);
    expect((await recruiter.put('/api/v1/settings/access', { restrictRecruitersToTeam: true })).status).toBe(403);
    expect((await w.owner.put('/api/v1/settings/access', { restrictRecruitersToTeam: true })).body.data).toEqual({ restrictRecruitersToTeam: true });
    expect((await recruiter.get('/api/v1/settings/access')).body.data).toEqual({ restrictRecruitersToTeam: true });
    expect((await recruiter.get(`/api/v1/jobs/${w.job.id}`)).status).toBe(404);
    await w.joinTeam(recruiter, 'recruiter');
    expect((await recruiter.get(`/api/v1/jobs/${w.job.id}`)).status).toBe(200);
  });

  it('puts the creator of a job on its team', async () => {
    const w = await createWorld(t);
    const team = (await w.owner.get<Team>(`/api/v1/jobs/${w.job.id}/team`)).body.data!;
    expect(team.members).toEqual([expect.objectContaining({ userId: await userIdOf(w.owner), role: 'recruiter', source: 'team' })]);
  });
});
