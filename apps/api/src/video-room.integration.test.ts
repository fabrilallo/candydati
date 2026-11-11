import { and, eq, schema } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey } from './testing/api-keys.js';
import { createWorld, userIdOf } from './testing/candidate-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const ROOM_PATH = '/api/v1/me/video-room';
const ROOM = 'https://meet.google.com/abc-defg-hij';

describe('my video room', () => {
  it('saves, reads back, replaces and removes the link', async () => {
    const w = await createWorld(t);
    const interviewer = await w.member('interviewer');
    expect((await interviewer.get(ROOM_PATH)).body.data).toEqual({ url: null, provider: null });
    const saved = await interviewer.put(ROOM_PATH, { url: ROOM });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual({ url: ROOM, provider: 'meet' });
    expect((await interviewer.download(ROOM_PATH)).headers['cache-control']).toBe('no-store');
    expect((await interviewer.put(ROOM_PATH, { url: 'https://us02web.zoom.us/j/1' })).body.data).toEqual({ url: 'https://us02web.zoom.us/j/1', provider: 'zoom' });
    expect((await interviewer.delete(ROOM_PATH)).body.data).toEqual({ removed: true });
    expect((await interviewer.get(ROOM_PATH)).body.data).toEqual({ url: null, provider: null });
  });

  it('refuses plain http, an API key and no session', async () => {
    const w = await createWorld(t);
    expect((await w.owner.put(ROOM_PATH, { url: 'http://meet.google.com/abc' })).status).toBe(422);
    const key = await createKey(w.owner, ['job:read']);
    expect((await t.app.inject({ method: 'GET', url: ROOM_PATH, headers: { authorization: `Bearer ${key.secret}` } })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'GET', url: ROOM_PATH })).statusCode).toBe(401);
  });

  it('goes when the person leaves the organization', async () => {
    const w = await createWorld(t);
    const recruiter = await w.member('recruiter');
    expect((await recruiter.put(ROOM_PATH, { url: ROOM })).status).toBe(200);
    const userId = await userIdOf(recruiter);
    const list = (await w.owner.get<unknown>('/api/auth/organization/list-members')).body as unknown as { members: { id: string; userId: string }[] };
    const member = list.members.find((m) => m.userId === userId)!;
    expect((await w.owner.post('/api/auth/organization/remove-member', { memberIdOrEmail: member.id })).status).toBe(200);
    expect(await t.handle.db.select().from(schema.videoRoom).where(and(eq(schema.videoRoom.userId, userId)))).toEqual([]);
  });
});
