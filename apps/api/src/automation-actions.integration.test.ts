import { completeJobContent } from '@candydati/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, personForm, type World } from './testing/candidate-world.js';
import { drainAutomations } from './testing/phase4.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

interface Board { stages: { id: string }[]; applications: { id: string; stageId: string }[] }
interface Proposal { id: string; applicationId: string; from: { id: string }; to: { id: string; label: string | null }; candidate: { firstName: string } }
interface Rule { id: string; stageId: string; action: { type: string }; createdBy: string }
interface Notification { kind: string }

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const board = async (w: World) => (await w.owner.get<Board>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!;
async function applyOne(w: World, firstName = 'Giulia'): Promise<string> {
  const before = new Set((await board(w)).applications.map((a) => a.id));
  expect((await w.submit(personForm({ firstName, email: uniqueEmail('cand') }))).statusCode).toBe(201);
  return (await board(w)).applications.map((a) => a.id).find((id) => !before.has(id))!;
}

async function proposeWorld() {
  const w = await createWorld(t);
  const target = (await board(w)).stages[1]!.id;
  const rule = await w.owner.post<Rule>(`/api/v1/jobs/${w.job.id}/automations`, { stageId: 'received', action: { type: 'propose_move', toStageId: target } });
  expect(rule.status).toBe(201);
  const applicationId = await applyOne(w, 'Marta');
  await drainAutomations(t);
  return { w, target, applicationId };
}

describe('propose_move: a suggestion that a person confirms or dismisses', () => {
  it('moves nothing by itself; the confirming person moves the application through the normal move', async () => {
    const { w, target, applicationId } = await proposeWorld();
    expect((await board(w)).applications.find((a) => a.id === applicationId)?.stageId).toBe('received');
    const listed = (await w.owner.get<Proposal[]>(`/api/v1/move-proposals?applicationId=${applicationId}`)).body.data!;
    expect(listed).toEqual([expect.objectContaining({ applicationId, from: { id: 'received', label: expect.anything() }, to: expect.objectContaining({ id: target }), candidate: expect.objectContaining({ firstName: 'Marta' }) })]);

    const interviewer = await w.member('interviewer');
    await w.joinTeam(interviewer, 'interviewer');
    expect((await interviewer.post(`/api/v1/move-proposals/${listed[0]!.id}/confirm`)).status).toBe(403);

    const confirmed = await w.owner.post<{ proposalId: string }>(`/api/v1/move-proposals/${listed[0]!.id}/confirm`);
    expect(confirmed.status).toBe(200);
    expect((await board(w)).applications.find((a) => a.id === applicationId)?.stageId).toBe(target);
    expect((await w.owner.post(`/api/v1/move-proposals/${listed[0]!.id}/confirm`)).status).toBe(409);
    expect((await w.owner.get<Proposal[]>('/api/v1/move-proposals')).body.data).toEqual([]);
    const audit = (await w.owner.get<{ action: string }[]>('/api/v1/audit-log?limit=50')).body.data!.map((e) => e.action);
    expect(audit).toEqual(expect.arrayContaining(['application.moved', 'move_proposal.confirmed']));
  });

  it('a dismissed proposal moves nothing; another organization cannot see or act on it', async () => {
    const { w, applicationId } = await proposeWorld();
    const [proposal] = (await w.owner.get<Proposal[]>('/api/v1/move-proposals')).body.data!;
    const stranger = await createWorld(t, 'Other');
    expect((await stranger.owner.get<Proposal[]>('/api/v1/move-proposals')).body.data).toEqual([]);
    expect((await stranger.owner.post(`/api/v1/move-proposals/${proposal!.id}/dismiss`)).status).toBe(404);
    expect((await w.owner.post(`/api/v1/move-proposals/${proposal!.id}/dismiss`)).status).toBe(200);
    expect((await board(w)).applications.find((a) => a.id === applicationId)?.stageId).toBe('received');
    expect((await w.owner.get<Proposal[]>('/api/v1/move-proposals')).body.data).toEqual([]);
  });

  it('refuses a rule that proposes the stage it is on', async () => {
    const w = await createWorld(t);
    const reply = await w.owner.post(`/api/v1/jobs/${w.job.id}/automations`, { stageId: 'received', action: { type: 'propose_move', toStageId: 'received' } });
    expect(reply.status).toBe(422);
  });
});

describe('the other new actions', () => {
  it('tags the candidate and alerts the job owner in app', async () => {
    const w = await createWorld(t);
    const url = `/api/v1/jobs/${w.job.id}/automations`;
    expect((await w.owner.post(url, { stageId: 'received', action: { type: 'add_tag', tag: 'Inbound' } })).status).toBe(201);
    expect((await w.owner.post(url, { stageId: 'received', action: { type: 'notify', channel: 'in_app', recipients: ['job_owner'] } })).status).toBe(201);
    expect((await w.owner.post(url, { stageId: 'received', action: { type: 'notify', channel: 'in_app', recipients: ['nobody-here'] } })).status).toBe(422);
    await applyOne(w);
    await drainAutomations(t);
    const kinds = (await w.owner.get<Notification[]>('/api/v1/notifications')).body.data!.map((n) => n.kind);
    expect(kinds).toContain('automation_alert');
    const candidates = (await w.owner.get<{ tags: string[] }[]>('/api/v1/candidates?tag=inbound')).body.data!;
    expect(candidates).toHaveLength(1);
  });
});

describe('copying rules', () => {
  it('copies a stage into an automation pack on its stage type, and a job created from a template with that pack gets the rules as its creator’s', async () => {
    const w = await createWorld(t);
    await w.owner.post(`/api/v1/jobs/${w.job.id}/automations`, { stageId: 'received', action: { type: 'create_task', title: 'Read the CV' } });
    const pack = (await w.owner.post<{ id: string }>('/api/v1/automation-packs', { name: 'Backend' })).body.data!;
    const copied = await w.owner.post<{ created: string[]; to: { kind: string } }>('/api/v1/automations/copy', { from: { jobId: w.job.id, stageId: 'received' }, to: { packId: pack.id, stageId: 'received' } });
    expect(copied.status).toBe(201);
    expect(copied.body.data!.to.kind).toBe('pack');
    expect((await w.owner.get<{ stage: string }[]>(`/api/v1/automation-packs/${pack.id}/rules`)).body.data!.map((r) => r.stage)).toEqual(['received']);

    const template = (await w.owner.post<{ id: string }>('/api/v1/job-templates', { name: 'Backend', content: completeJobContent() })).body.data!;
    await w.owner.put(`/api/v1/job-templates/${template.id}/automation-packs`, { packIds: [pack.id] });
    const job = (await w.owner.post<{ id: string }>('/api/v1/jobs', { templateId: template.id, content: {} })).body.data!;
    expect((await w.owner.get<Rule[]>(`/api/v1/jobs/${job.id}/automations`)).body.data!.map((r) => [r.stageId, r.action.type])).toEqual([['received', 'create_task']]);

    const bad = await w.owner.post('/api/v1/automations/copy', { from: { jobId: w.job.id, stageId: 'received' }, to: { jobId: job.id, stageId: 'nope' } });
    expect(bad.status).toBe(422);
    expect((await (await w.member('interviewer')).post('/api/v1/automations/copy', { from: { jobId: w.job.id, stageId: 'received' }, to: { packId: pack.id, stageId: 'offer' } })).status).toBe(403);
    expect((await w.owner.get(`/api/v1/job-templates/${template.id}/automations`)).status).toBe(404);
  });
});
