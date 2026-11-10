import { createHash, randomBytes } from 'node:crypto';
import { eq, schema } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey } from './testing/api-keys.js';
import { userIdOf, type World } from './testing/candidate-world.js';
import { applyAs, createWorld } from './testing/privacy-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const anonymous = (method: 'GET' | 'POST', url: string, payload?: object) => t.app.inject({ method, url, ...(payload ? { payload } : {}) });

async function technicalStage(w: World): Promise<string> {
  const board = await w.owner.get<{ stages: { id: string; declared: { type: string } | null }[] }>(`/api/v1/jobs/${w.job.id}/pipeline`);
  return board.body.data!.stages.find((stage) => stage.declared !== null)!.id;
}

/** The invitation's link is made by the worker at delivery; here the test holds a secret of its own instead. */
async function giveLink(interviewId: string): Promise<string> {
  const secret = randomBytes(18).toString('hex');
  await t.handle.db.update(schema.interview).set({ tokenHash: createHash('sha256').update(secret).digest('hex') }).where(eq(schema.interview.id, interviewId));
  return secret;
}

async function proposed(w: World) {
  const stageId = await technicalStage(w);
  const hm = await w.member('hiring_manager');
  await w.joinTeam(hm, 'hiring_manager');
  await w.owner.put(`/api/v1/jobs/${w.job.id}/interviewers`, { stages: [{ stageId, interviewers: [{ kind: 'member', userId: await userIdOf(hm) }] }] });
  const applied = await applyAs(w);
  const result = await w.owner.post<{ interview: { id: string; status: string }; freeSlots: number; withoutCalendar: string[] }>(`/api/v1/applications/${applied.applicationId}/interviews`, { stageId, mode: 'video', location: 'https://meet.example.com/abc' });
  return { stageId, hm, applied, result };
}

describe('interviews booked from the calendars', () => {
  it('proposes, lets the candidate book on the page without an account, and sends the invite to everyone', async () => {
    const w = await createWorld(t);
    const { applied, result } = await proposed(w);
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ interview: { status: 'proposed' }, withoutCalendar: [expect.any(String)] });
    expect(result.body.data!.freeSlots).toBeGreaterThan(0);
    const secret = await giveLink(result.body.data!.interview.id);

    const page = await anonymous('GET', `/api/v1/public/interviews/${secret}`);
    expect(page.statusCode).toBe(200);
    expect(page.headers['cache-control']).toBe('no-store');
    const view = page.json().data as { status: string; slots: string[]; interviewers: string[] };
    expect(view.status).toBe('proposed');
    expect(view.interviewers).toHaveLength(1);
    const slot = view.slots[0]!;

    const before = t.emailSender.sent().length;
    const booked = await anonymous('POST', `/api/v1/public/interviews/${secret}/book`, { slot });
    expect(booked.statusCode).toBe(200);
    expect(booked.json().data).toMatchObject({ status: 'booked', startsAt: slot });
    const invites = t.emailSender.sent().slice(before);
    expect(invites.length).toBe(2);
    expect(invites.every((mail) => mail.calendar?.method === 'REQUEST')).toBe(true);
    expect(invites.map((mail) => mail.to)).toContain(applied.person.email.toLowerCase());

    const listed = await w.owner.get<{ status: string; startsAt: string }[]>(`/api/v1/applications/${applied.applicationId}/interviews`);
    expect(listed.body.data).toMatchObject([{ status: 'booked', startsAt: slot }]);
    expect(JSON.stringify(listed.body)).not.toContain('tokenHash');
    // The link changed with the booking: the old one is gone, the new one shows the booking.
    expect((await anonymous('GET', `/api/v1/public/interviews/${secret}`)).statusCode).toBe(404);
    const next = (booked.json().data as { token: string }).token;
    expect((await anonymous('GET', `/api/v1/public/interviews/${next}`)).json().data).toMatchObject({ status: 'booked' });
    expect((await anonymous('POST', `/api/v1/public/interviews/${next}/cancel`)).json().data).toEqual({ status: 'cancelled' });
    expect(t.emailSender.sent().at(-1)?.calendar?.method).toBe('CANCEL');
  });

  it('refuses a time that is not free, an unknown link, and a second open interview', async () => {
    const w = await createWorld(t);
    const { stageId, applied, result } = await proposed(w);
    const secret = await giveLink(result.body.data!.interview.id);
    expect((await anonymous('POST', `/api/v1/public/interviews/${secret}/book`, { slot: '2020-01-01T09:00:00.000Z' })).statusCode).toBe(409);
    expect((await anonymous('GET', `/api/v1/public/interviews/${'x'.repeat(32)}`)).statusCode).toBe(404);
    expect((await w.owner.post(`/api/v1/applications/${applied.applicationId}/interviews`, { stageId, mode: 'phone' })).status).toBe(409);
  });

  it('lets interviewers see interviews but not propose them, and keeps other organizations out', async () => {
    const w = await createWorld(t);
    const { stageId, applied, result, hm } = await proposed(w);
    const interviewer = await w.member('interviewer');
    await w.joinTeam(interviewer, 'interviewer');
    expect((await interviewer.get(`/api/v1/applications/${applied.applicationId}/interviews`)).status).toBe(200);
    expect((await interviewer.post(`/api/v1/applications/${applied.applicationId}/interviews`, { stageId, mode: 'phone' })).status).toBe(403);
    expect((await hm.post(`/api/v1/interviews/${result.body.data!.interview.id}/cancel`)).status).toBe(200);
    const other = await createWorld(t);
    expect((await other.owner.get(`/api/v1/applications/${applied.applicationId}/interviews`)).status).toBe(404);
    const key = await createKey(w.owner, ['interview:read', 'candidate:read']);
    const viaKey = await t.app.inject({ method: 'GET', url: `/api/v1/applications/${applied.applicationId}/interviews`, headers: { authorization: `Bearer ${key.secret}` } });
    expect(viaKey.statusCode).toBe(200);
  });
});
