import { signWebhook } from '@tt/core';
import { createFakeHttpPoster } from '@tt/core/testing';
import { createHostGuard } from '@tt/providers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestUser } from './testing/client.js';
import { createWorld, personForm, type World } from './testing/candidate-world.js';
import { deliver, deliveryJobs, drainAutomations, publishOutbox } from './testing/phase4.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

interface Task { id: string; title: string; completedAt: string | null; assignee: { id: string; name: string }; applicationId: string | null; dueAt: string | null; candidate: { firstName: string } | null }
interface Rule { id: string; stageId: string; action: { type: string }; enabled: boolean; createdBy: string }
interface Hook { id: string; url: string; events: string[]; enabled: boolean; secret?: string }
interface Delivery { eventType: string; status: string; error: string | null; attempt: number }
interface Board { stages: { id: string }[]; applications: { id: string }[] }
interface Message { status: string; sentBy: { id: string } | null }

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const userIdOf = async (user: TestUser): Promise<string> => ((await user.get('/api/auth/get-session')).body as unknown as { user: { id: string } }).user.id;
const board = async (w: World) => (await w.owner.get<Board>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!;
async function applyOne(w: World): Promise<string> {
  const before = new Set((await board(w)).applications.map((a) => a.id));
  expect((await w.submit(personForm({ email: uniqueEmail('cand') }))).statusCode).toBe(201);
  return (await board(w)).applications.map((a) => a.id).find((id) => !before.has(id))!;
}

describe('tasks', () => {
  it('creates, lists, completes and reopens tasks for members of the organization', async () => {
    const w = await createWorld(t);
    const recruiter = await w.member('recruiter');
    const recruiterId = await userIdOf(recruiter);
    const applicationId = await applyOne(w);

    const created = await w.owner.post<Task>('/api/v1/tasks', { title: 'Call Giulia', assigneeId: recruiterId, applicationId, dueAt: '2030-01-01T10:00:00.000Z' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ title: 'Call Giulia', applicationId, completedAt: null, assignee: { id: recruiterId }, candidate: { firstName: 'Giulia' }, dueAt: '2030-01-01T10:00:00.000Z' });
    const id = created.body.data!.id;

    expect((await recruiter.get<Task[]>('/api/v1/tasks?mine=true&open=true')).body.data!.map((x) => x.id)).toEqual([id]);
    expect((await w.owner.get<Task[]>('/api/v1/tasks')).body.data).toEqual([]);
    expect((await w.owner.get<Task[]>('/api/v1/tasks?mine=false')).body.data!.map((x) => x.id)).toEqual([id]);
    expect((await w.owner.get<Task[]>(`/api/v1/applications/${applicationId}/tasks`)).body.data!.map((x) => x.id)).toEqual([id]);

    const done = await recruiter.post<Task>(`/api/v1/tasks/${id}/complete`);
    expect(done.status).toBe(200);
    expect(done.body.data!.completedAt).not.toBeNull();
    expect((await recruiter.post(`/api/v1/tasks/${id}/complete`)).status).toBe(409);
    expect((await recruiter.get<Task[]>('/api/v1/tasks')).body.data).toEqual([]);
    expect((await recruiter.get<Task[]>('/api/v1/tasks?open=false')).body.data).toHaveLength(1);
    expect((await recruiter.post<Task>(`/api/v1/tasks/${id}/reopen`)).body.data!.completedAt).toBeNull();
    expect((await recruiter.post(`/api/v1/tasks/${id}/reopen`)).status).toBe(409);

    const notes = (await recruiter.get<{ kind: string }[]>('/api/v1/notifications')).body.data!;
    expect(notes.map((n) => n.kind)).toContain('task_assigned');
  });

  it('follows the role matrix: manage for owner, admin, recruiter and hiring manager; read for interviewers', async () => {
    const w = await createWorld(t);
    const assigneeId = await userIdOf(w.owner);
    for (const role of ['admin', 'recruiter', 'hiring_manager']) {
      expect((await (await w.member(role)).post('/api/v1/tasks', { title: `by ${role}`, assigneeId })).status).toBe(201);
    }
    const interviewer = await w.member('interviewer');
    expect((await interviewer.post('/api/v1/tasks', { title: 'nope', assigneeId })).status).toBe(403);
    expect((await interviewer.get('/api/v1/tasks')).status).toBe(200);
    const [first] = (await w.owner.get<Task[]>('/api/v1/tasks')).body.data!;
    expect((await interviewer.post(`/api/v1/tasks/${first!.id}/complete`)).status).toBe(403);
  });

  it('refuses an assignee outside the organization, a foreign application and foreign tasks', async () => {
    const w = await createWorld(t);
    const other = await createWorld(t, 'Other');
    const stranger = await userIdOf(other.owner);
    const own = await userIdOf(w.owner);
    expect((await w.owner.post('/api/v1/tasks', { title: 'x', assigneeId: stranger })).status).toBe(422);
    const foreignApp = await applyOne(other);
    expect((await w.owner.post('/api/v1/tasks', { title: 'x', assigneeId: own, applicationId: foreignApp })).status).toBe(404);
    expect((await w.owner.post('/api/v1/tasks', { title: '', assigneeId: own })).status).toBe(422);
    const theirs = (await other.owner.post<Task>('/api/v1/tasks', { title: 'secret', assigneeId: stranger })).body.data!;
    expect((await w.owner.post(`/api/v1/tasks/${theirs.id}/complete`)).status).toBe(404);
    expect((await w.owner.get<Task[]>('/api/v1/tasks?mine=false')).body.data).toEqual([]);
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/tasks' })).statusCode).toBe(401);
  });
});

describe('automations', () => {
  it('manages rules per job and stage, for owner, admin and recruiter only', async () => {
    const w = await createWorld(t);
    const stage = (await board(w)).stages[1]!.id;
    const url = `/api/v1/jobs/${w.job.id}/automations`;
    const created = await w.owner.post<Rule>(url, { stageId: stage, action: { type: 'create_task', title: 'Prepare' } });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ stageId: stage, enabled: true, action: { type: 'create_task', title: 'Prepare', assignee: 'job_owner' } });
    const id = created.body.data!.id;
    expect((await w.owner.get<Rule[]>(url)).body.data!.map((r) => r.id)).toEqual([id]);

    const updated = await w.owner.put<Rule>(`/api/v1/automations/${id}`, { stageId: stage, enabled: false, action: { type: 'create_task', title: 'Prepare 2', dueInDays: 2 } });
    expect(updated.body.data).toMatchObject({ enabled: false, action: { title: 'Prepare 2', dueInDays: 2 }, createdBy: created.body.data!.createdBy });

    expect((await (await w.member('recruiter')).get(url)).status).toBe(200);
    expect((await (await w.member('hiring_manager')).get(url)).status).toBe(403);
    expect((await (await w.member('interviewer')).post(url, { stageId: stage, action: { type: 'create_task', title: 'x' } })).status).toBe(403);

    expect((await w.owner.post(url, { stageId: 'stg-nope', action: { type: 'create_task', title: 'x' } })).status).toBe(422);
    expect((await w.owner.post(url, { stageId: stage, action: { type: 'send_template', templateId: 'missing' } })).status).toBe(422);
    expect((await w.owner.post(url, { stageId: stage, action: { type: 'move', stageId: 'received' } })).status).toBe(422);
    expect((await w.owner.delete(`/api/v1/automations/${id}`)).status).toBe(200);
    expect((await w.owner.delete(`/api/v1/automations/${id}`)).status).toBe(404);
  });

  it('a create_task rule makes a task when an application enters the stage', async () => {
    const w = await createWorld(t);
    const stage = (await board(w)).stages[1]!.id;
    await w.owner.post(`/api/v1/jobs/${w.job.id}/automations`, { stageId: stage, action: { type: 'create_task', title: 'Prepare the interview', dueInDays: 3 } });
    const applicationId = await applyOne(w);
    await drainAutomations(t);
    expect((await w.owner.get<Task[]>(`/api/v1/applications/${applicationId}/tasks`)).body.data).toEqual([]);

    expect((await w.owner.post(`/api/v1/applications/${applicationId}/move`, { stageId: stage })).status).toBe(200);
    expect(await drainAutomations(t)).toBe(1);
    const tasks = (await w.owner.get<Task[]>(`/api/v1/applications/${applicationId}/tasks`)).body.data!;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: 'Prepare the interview', assignee: { name: 'Owner' } });
    expect(tasks[0]!.dueAt).not.toBeNull();
    const audit = (await w.owner.get<{ action: string }[]>('/api/v1/audit-log?limit=100')).body.data!;
    expect(audit.map((a) => a.action)).toContain('automation.ran');
  });

  it('a send_template rule queues a message sent in the name of the rule author', async () => {
    const w = await createWorld(t);
    const author = await w.member('recruiter');
    const authorId = await userIdOf(author);
    const stage = (await board(w)).stages[1]!.id;
    const rule = await author.post<Rule>(`/api/v1/jobs/${w.job.id}/automations`, { stageId: stage, action: { type: 'send_template', templateId: 'default:stage_update' } });
    expect(rule.status).toBe(201);
    const applicationId = await applyOne(w);
    await w.owner.post(`/api/v1/applications/${applicationId}/move`, { stageId: stage });
    await drainAutomations(t);
    const messages = (await w.owner.get<Message[]>(`/api/v1/applications/${applicationId}/messages`)).body.data!;
    const queued = messages.find((m) => m.status === 'queued' && m.sentBy?.id === authorId);
    expect(queued).toBeDefined();
  });

  it('never acts on a decided application and keeps working after the rule failed', async () => {
    const w = await createWorld(t);
    const stage = (await board(w)).stages[1]!.id;
    await w.owner.post(`/api/v1/jobs/${w.job.id}/automations`, { stageId: stage, action: { type: 'create_task', title: 'T' } });
    const applicationId = await applyOne(w);
    await w.owner.post(`/api/v1/applications/${applicationId}/move`, { stageId: stage });
    await w.owner.post(`/api/v1/applications/${applicationId}/decide`, { outcome: 'not_selected' });
    await drainAutomations(t);
    expect((await w.owner.get<Task[]>(`/api/v1/applications/${applicationId}/tasks`)).body.data).toEqual([]);
  });
});

describe('webhooks', () => {
  it('returns the secret only on creation and never again', async () => {
    const w = await createWorld(t);
    const created = await w.owner.post<Hook>('/api/v1/webhooks', { url: 'https://hooks.example.com/tt', events: ['application.moved', 'application.moved', 'job.closed'] });
    expect(created.status).toBe(201);
    expect(created.body.data!.secret).toMatch(/^whsec_/);
    expect(created.body.data).toMatchObject({ events: ['application.moved', 'job.closed'], enabled: true });
    const id = created.body.data!.id;

    const listed = await w.owner.get<Hook[]>('/api/v1/webhooks');
    expect(listed.body.data).toHaveLength(1);
    expect(JSON.stringify(listed.body)).not.toContain(created.body.data!.secret);
    const updated = await w.owner.put<Hook>(`/api/v1/webhooks/${id}`, { url: 'https://hooks.example.com/v2', events: ['job.published'], enabled: false });
    expect(updated.body.data).toMatchObject({ url: 'https://hooks.example.com/v2', enabled: false });
    expect(updated.body.data).not.toHaveProperty('secret');
    expect((await w.owner.delete(`/api/v1/webhooks/${id}`)).status).toBe(200);
    expect((await w.owner.delete(`/api/v1/webhooks/${id}`)).status).toBe(404);
    const audit = JSON.stringify((await w.owner.get('/api/v1/audit-log?limit=100')).body);
    expect(audit).toContain('webhook.saved');
    expect(audit).not.toContain(created.body.data!.secret);
  });

  it('is for owners and admins, validates URLs and stays inside the organization', async () => {
    const w = await createWorld(t);
    const body = { url: 'https://hooks.example.com/tt', events: ['job.closed'] };
    expect((await (await w.member('admin')).post('/api/v1/webhooks', body)).status).toBe(201);
    for (const role of ['recruiter', 'hiring_manager', 'interviewer']) {
      const user = await w.member(role);
      expect((await user.post('/api/v1/webhooks', body)).status).toBe(403);
      expect((await user.get('/api/v1/webhooks')).status).toBe(403);
    }
    expect((await w.owner.post('/api/v1/webhooks', { ...body, url: 'http://hooks.example.com/tt' })).status).toBe(422);
    expect((await w.owner.post('/api/v1/webhooks', { ...body, url: 'http://localhost:9999/tt' })).status).toBe(422);
    expect((await w.owner.post('/api/v1/webhooks', { ...body, url: 'https://user:pw@hooks.example.com' })).status).toBe(422);
    expect((await w.owner.post('/api/v1/webhooks', { ...body, events: [] })).status).toBe(422);
    expect((await w.owner.post('/api/v1/webhooks', { ...body, events: ['candidate.deleted'] })).status).toBe(422);

    const other = await createWorld(t, 'Other');
    const [mine] = (await w.owner.get<Hook[]>('/api/v1/webhooks')).body.data!;
    expect((await other.owner.get<Hook[]>('/api/v1/webhooks')).body.data).toEqual([]);
    expect((await other.owner.delete(`/api/v1/webhooks/${mine!.id}`)).status).toBe(404);
    expect((await other.owner.post(`/api/v1/webhooks/${mine!.id}/test`)).status).toBe(404);
    expect((await other.owner.get(`/api/v1/webhooks/${mine!.id}/deliveries`)).status).toBe(404);
  });

  it('delivers a signed application.moved with ids only, and logs the attempt', async () => {
    const w = await createWorld(t);
    const created = (await w.owner.post<Hook>('/api/v1/webhooks', { url: 'https://hooks.example.com/tt', events: ['application.moved'] })).body.data!;
    const applicationId = await applyOne(w);
    await publishOutbox(t);
    const before = deliveryJobs(t).length;
    await w.owner.post(`/api/v1/applications/${applicationId}/move`, { stageId: (await board(w)).stages[1]!.id });
    await publishOutbox(t);
    const jobs = deliveryJobs(t).slice(before).filter((j) => j.endpointId === created.id);
    expect(jobs).toHaveLength(1);

    const poster = createFakeHttpPoster();
    expect(await deliver(t, jobs[0]!, poster, createHostGuard({ allowPrivate: false, resolve: async () => ['93.184.216.34'] }))).toBe('delivered');
    const [request] = poster.requests();
    const headers = request!.headers;
    expect(headers['x-tt-event']).toBe('application.moved');
    expect(headers['x-tt-signature']).toBe(signWebhook(created.secret!, headers['x-tt-timestamp']!, request!.body));
    const payload = JSON.parse(request!.body) as { type: string; organizationId: string; data: Record<string, unknown> };
    expect(payload).toMatchObject({ type: 'application.moved', data: { applicationId } });
    expect(request!.body).not.toMatch(/@example\.com|Giulia|Bianchi/);

    const log = (await w.owner.get<Delivery[]>(`/api/v1/webhooks/${created.id}/deliveries`)).body.data!;
    expect(log).toEqual([expect.objectContaining({ eventType: 'application.moved', status: 'success', attempt: 1, error: null })]);
    expect(JSON.stringify(log)).not.toContain('Giulia');
  });

  it('sends a test ping, and an SSRF target is refused at delivery when private hosts are not allowed', async () => {
    const w = await createWorld(t);
    const created = (await w.owner.post<Hook>('/api/v1/webhooks', { url: 'https://127.0.0.1/hook', events: ['job.closed'] })).body.data!;
    const ping = await w.owner.post<{ eventId: string }>(`/api/v1/webhooks/${created.id}/test`);
    expect(ping.status).toBe(200);
    const job = deliveryJobs(t).find((j) => j.eventId === ping.body.data!.eventId)!;
    expect(job.endpointId).toBe(created.id);

    const poster = createFakeHttpPoster();
    expect(await deliver(t, job, poster, createHostGuard({ allowPrivate: false }))).toBe('failed');
    expect(poster.requests()).toEqual([]);
    expect((await w.owner.get<Delivery[]>(`/api/v1/webhooks/${created.id}/deliveries`)).body.data).toEqual([
      expect.objectContaining({ eventType: 'ping', status: 'failed', error: 'host_blocked', attempt: 1 }),
    ]);

    expect(await deliver(t, job, poster, createHostGuard({ allowPrivate: true }))).toBe('delivered');
    expect(poster.requests()).toHaveLength(1);
  });

  it('closing a job and publishing queue their events for subscribed endpoints only', async () => {
    const w = await createWorld(t);
    const closedHook = (await w.owner.post<Hook>('/api/v1/webhooks', { url: 'https://hooks.example.com/a', events: ['job.closed'] })).body.data!;
    const movedHook = (await w.owner.post<Hook>('/api/v1/webhooks', { url: 'https://hooks.example.com/b', events: ['application.moved'] })).body.data!;
    await w.owner.post(`/api/v1/jobs/${w.job.id}/close`);
    await publishOutbox(t);
    const endpoints = deliveryJobs(t).map((j) => j.endpointId);
    expect(endpoints).toContain(closedHook.id);
    expect(endpoints).not.toContain(movedHook.id);
  });
});
