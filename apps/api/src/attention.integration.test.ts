import { markDigestsEmailed } from '@tt/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, personForm, type World } from './testing/candidate-world.js';
import { scan, scanDeps, setResponseDue } from './testing/phase4.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

interface Item { applicationId: string; state: string; job: { id: string; title: string }; candidate: { firstName: string }; stage: { id: string }; responseDueAt: string; ownerName: string }
interface Note { id: string; kind: string; applicationId: string | null; readAt: string | null; payload: Record<string, unknown> }
interface Board { applications: { id: string }[] }
interface Failure { error: { code: string; issues?: { path: string; message: string }[] } | null }

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const HOUR = 3_600_000;

/** Submits `count` applications and returns their ids, oldest first. */
async function apply(w: World, count: number): Promise<string[]> {
  for (let i = 0; i < count; i += 1) expect((await w.submit(personForm({ email: uniqueEmail('cand') }))).statusCode).toBe(201);
  return (await w.owner.get<Board>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!.applications.map((a) => a.id);
}

describe('attention list', () => {
  it('shows only applications due within 48 hours or overdue, most urgent first, filtered by state', async () => {
    const w = await createWorld(t);
    const [onTrack, soon, late] = await apply(w, 3);
    await setResponseDue(t, soon!, new Date(Date.now() + 10 * HOUR));
    await setResponseDue(t, late!, new Date(Date.now() - HOUR));
    await setResponseDue(t, onTrack!, new Date(Date.now() + 5 * 24 * HOUR));

    const all = await w.owner.get<Item[]>('/api/v1/applications/attention');
    expect(all.status).toBe(200);
    expect(all.body.data!.map((i) => [i.applicationId, i.state])).toEqual([[late, 'overdue'], [soon, 'due_soon']]);
    expect(all.body.meta).toMatchObject({ total: 2, page: 1 });
    expect(all.body.data![0]).toMatchObject({ job: { id: w.job.id, title: 'Backend Developer' }, candidate: { firstName: 'Giulia' }, ownerName: 'Owner' });
    expect(Object.keys(all.body.data![0]!.candidate).sort()).toEqual(['firstName', 'id', 'lastName']);

    expect((await w.owner.get<Item[]>('/api/v1/applications/attention?state=overdue')).body.data!.map((i) => i.applicationId)).toEqual([late]);
    expect((await w.owner.get<Item[]>('/api/v1/applications/attention?state=due_soon&limit=1&page=1')).body.meta).toMatchObject({ total: 1, limit: 1 });
    expect((await w.owner.get('/api/v1/applications/attention?state=nope')).status).toBe(422);
  });

  it('is readable by whoever reads candidates and never crosses organizations', async () => {
    const w = await createWorld(t);
    const [only] = await apply(w, 1);
    await setResponseDue(t, only!, new Date(Date.now() - HOUR));
    expect((await (await w.member('interviewer')).get<Item[]>('/api/v1/applications/attention')).body.data).toHaveLength(1);
    const other = await createWorld(t, 'Other');
    expect((await other.owner.get<Item[]>('/api/v1/applications/attention')).body.data!.filter((i) => i.applicationId === only)).toEqual([]);
  });

  it('refuses anonymous requests', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/applications/attention' })).statusCode).toBe(401);
  });
});

describe('the deadline scan and notifications', () => {
  it('notifies the job owner once, escalates after two days to owners and admins, and keeps notifications private', async () => {
    const w = await createWorld(t);
    const admin = await w.member('admin');
    const recruiter = await w.member('recruiter');
    const [soon, late] = await apply(w, 2);
    await setResponseDue(t, soon!, new Date(Date.now() + 5 * HOUR));
    await setResponseDue(t, late!, new Date(Date.now() - 3 * 24 * HOUR));

    const first = await scan(t, new Date());
    expect(first.digests.find((d) => d.email === w.owner.email)?.notifications.map((n) => n.kind).sort()).toEqual(['response_due_soon', 'response_overdue']);
    expect(first.digests.find((d) => d.email === admin.email)?.notifications).toHaveLength(1);

    const mine = (await w.owner.get<Note[]>('/api/v1/notifications')).body.data!;
    expect(mine.map((n) => n.kind).sort()).toEqual(['response_due_soon', 'response_overdue']);
    expect(mine.every((n) => n.readAt === null)).toBe(true);
    expect((await w.owner.get<{ count: number }>('/api/v1/notifications/unread-count')).body.data).toEqual({ count: 2 });

    const escalated = (await admin.get<Note[]>('/api/v1/notifications')).body.data!;
    expect(escalated.map((n) => [n.kind, n.applicationId])).toEqual([['response_overdue', late]]);
    expect(escalated[0]!.payload).toMatchObject({ escalated: true });
    expect((await recruiter.get<Note[]>('/api/v1/notifications')).body.data).toEqual([]);

    // The worker emails the digest and marks it; only then does a later scan have nothing to send.
    await markDigestsEmailed(scanDeps(t).notifications, first.digests, new Date());
    const second = await scan(t, new Date());
    expect(second.digests.flatMap((d) => d.notifications).filter((n) => [soon, late].includes(n.applicationId ?? ''))).toEqual([]);
    expect((await w.owner.get<Note[]>('/api/v1/notifications')).body.data).toHaveLength(2);

    const unread = (await w.owner.get<Note[]>('/api/v1/notifications?unread=true&limit=1&page=1')).body;
    expect(unread.data).toHaveLength(1);
    expect(unread.meta).toMatchObject({ total: 2, limit: 1 });

    // Someone else cannot mark the owner's notification as read.
    const stolen = await admin.post<{ updated: number }>('/api/v1/notifications/read', { ids: mine.map((n) => n.id) });
    expect(stolen.body.data).toEqual({ updated: 0 });
    expect((await w.owner.get<{ count: number }>('/api/v1/notifications/unread-count')).body.data).toEqual({ count: 2 });

    expect((await w.owner.post<{ updated: number }>('/api/v1/notifications/read', { ids: [mine[0]!.id] })).body.data).toEqual({ updated: 1 });
    expect((await w.owner.get<{ count: number }>('/api/v1/notifications/unread-count')).body.data).toEqual({ count: 1 });
    expect((await w.owner.post<{ updated: number }>('/api/v1/notifications/read', { all: true })).body.data).toEqual({ updated: 1 });
    expect((await w.owner.get<Note[]>('/api/v1/notifications?unread=true')).body.data).toEqual([]);
    expect((await admin.get<{ count: number }>('/api/v1/notifications/unread-count')).body.data).toEqual({ count: 1 });
  });

  it('validates the read request', async () => {
    const w = await createWorld(t);
    expect((await w.owner.post('/api/v1/notifications/read', {})).status).toBe(422);
    expect((await w.owner.post('/api/v1/notifications/read', { ids: ['a'], all: true })).status).toBe(422);
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/notifications/unread-count' })).statusCode).toBe(401);
  });

  it('a task due soon notifies its assignee once', async () => {
    const w = await createWorld(t);
    const member = await w.member('recruiter');
    const memberId = await userIdOf(member);
    const created = await w.owner.post<{ id: string }>('/api/v1/tasks', { title: 'Call', assigneeId: memberId, dueAt: new Date(Date.now() + 3 * HOUR).toISOString() });
    expect(created.status).toBe(201);
    await scan(t, new Date());
    await scan(t, new Date());
    const kinds = (await member.get<Note[]>('/api/v1/notifications')).body.data!.map((n) => n.kind).sort();
    expect(kinds).toEqual(['task_assigned', 'task_due']);
  });
});

describe('closing a job', () => {
  it('is refused with the open count, then allowed after the bulk "not selected" decision', async () => {
    const w = await createWorld(t);
    const ids = await apply(w, 2);
    const refused = await w.owner.post<Failure>(`/api/v1/jobs/${w.job.id}/close`);
    expect(refused.status).toBe(422);
    expect(refused.body.error?.issues).toEqual([{ path: 'applications', message: 'open_applications:2' }]);

    const interviewer = await w.member('interviewer');
    expect((await interviewer.post('/api/v1/applications/decide', { applicationIds: ids, outcome: 'not_selected' })).status).toBe(403);

    const decided = await w.owner.post<{ decided: number }>('/api/v1/applications/decide', { applicationIds: [...ids, ids[0]!], outcome: 'not_selected' });
    expect(decided.body.data).toEqual({ decided: 2 });
    const board = (await w.owner.get<{ applications: { outcome: string | null }[] }>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!;
    expect(board.applications.every((a) => a.outcome === 'not_selected')).toBe(true);

    expect((await w.owner.post('/api/v1/applications/decide', { applicationIds: ids, outcome: 'not_selected' })).status).toBe(409);
    const closed = await w.owner.post<{ status: string }>(`/api/v1/jobs/${w.job.id}/close`);
    expect(closed.status).toBe(200);
    expect(closed.body.data).toMatchObject({ status: 'closed' });

    const audit = (await w.owner.get<{ action: string }[]>('/api/v1/audit-log?limit=100')).body.data!;
    expect(audit.filter((a) => a.action === 'application.decided')).toHaveLength(2);
  });

  it('refuses to decide applications of another organization, writing nothing', async () => {
    const w = await createWorld(t);
    const other = await createWorld(t, 'Other');
    const [mine] = await apply(w, 1);
    const [theirs] = await apply(other, 1);
    expect((await w.owner.post('/api/v1/applications/decide', { applicationIds: [mine, theirs], outcome: 'not_selected' })).status).toBe(404);
    const board = (await w.owner.get<{ applications: { outcome: string | null }[] }>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!;
    expect(board.applications[0]!.outcome).toBeNull();
    expect((await w.owner.post('/api/v1/applications/decide', { applicationIds: [], outcome: 'not_selected' })).status).toBe(422);
  });
});

async function userIdOf(user: { get: <T>(url: string) => Promise<{ body: { data: T | null } }> }): Promise<string> {
  const session = await user.get<{ user: { id: string } }>('/api/auth/get-session');
  return (session.body as unknown as { user: { id: string } }).user.id;
}
