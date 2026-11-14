import { createHash, randomBytes } from 'node:crypto';
import { createFakeGoogleCalendarApi, createFakeGoogleCalendarAuth, type FakeGoogleCalendarApi } from '@candydati/core/testing';
import { eq, schema } from '@candydati/db';
import { GOOGLE_CALENDAR_REQUIRED_SCOPES } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userIdOf, type World } from './testing/candidate-world.js';
import type { TestUser } from './testing/client.js';
import { applyAs, createWorld } from './testing/privacy-world.js';
import { createTestApp, WEB_ORIGIN, type TestApp } from './testing/test-app.js';

const BASE = '/api/v1/me/calendar/google';
let t: TestApp;
let api: FakeGoogleCalendarApi;
beforeAll(async () => {
  const auth = createFakeGoogleCalendarAuth();
  auth.grant('hm-code', { refreshToken: 'refresh-hm', accountEmail: 'hugo@example.com', scopes: `openid ${GOOGLE_CALENDAR_REQUIRED_SCOPES.join(' ')}` });
  api = createFakeGoogleCalendarApi();
  t = await createTestApp({ googleCalendarAuth: auth, googleCalendarApi: api });
});
afterAll(async () => {
  await t.close();
});

/** The person goes to Google and comes back connected, as the browser does. */
async function connectGoogle(user: TestUser): Promise<void> {
  const start = await t.app.inject({ method: 'GET', url: `${BASE}/start`, headers: { origin: WEB_ORIGIN, cookie: user.cookieHeader() } });
  const state = new URL(String(start.headers.location)).searchParams.get('state') ?? '';
  const pending = String([start.headers['set-cookie']].flat()[0] ?? '').split(';')[0];
  const back = await t.app.inject({ method: 'GET', url: `${BASE}/callback?code=hm-code&state=${state}`, headers: { cookie: `${user.cookieHeader()}; ${pending}` } });
  expect(back.headers.location).toBe('/app/settings/calendar?google=connected');
}

async function technicalStage(w: World): Promise<string> {
  const board = await w.owner.get<{ stages: { id: string; declared: { type: string } | null }[] }>(`/api/v1/jobs/${w.job.id}/pipeline`);
  return board.body.data!.stages.find((stage) => stage.declared !== null)!.id;
}

describe('interviews with the interviewer’s Google Calendar', () => {
  it('reads busy times from Google, makes the event with its Meet at booking and keeps the hours of the connection', async () => {
    const w = await createWorld(t);
    const stageId = await technicalStage(w);
    const hm = await w.member('hiring_manager');
    await w.joinTeam(hm, 'hiring_manager');
    await w.owner.put(`/api/v1/jobs/${w.job.id}/interviewers`, { stages: [{ stageId, interviewers: [{ kind: 'member', userId: await userIdOf(hm) }] }] });
    await connectGoogle(hm);
    expect((await hm.patch('/api/v1/me/calendar-feed', { timeZone: 'Europe/Rome', workingHours: { days: [1, 2, 3, 4, 5, 6, 7], start: '08:00', end: '20:00' } })).status).toBe(200);
    expect((await hm.get<{ connection: { workingHours: { start: string } } }>(BASE)).body.data?.connection.workingHours.start).toBe('08:00');

    const applied = await applyAs(w);
    const defaults = await w.owner.get<{ meetBy: string | null }>(`/api/v1/applications/${applied.applicationId}/interviews/defaults?stageId=${stageId}`);
    expect(defaults.body.data?.meetBy).toEqual(expect.any(String));
    const proposed = await w.owner.post<{ interview: { id: string }; meetBy: string; withoutLink: boolean; withoutCalendar: string[] }>(`/api/v1/applications/${applied.applicationId}/interviews`, { stageId, mode: 'video' });
    expect(proposed.body.data).toMatchObject({ withoutLink: false, withoutCalendar: [] });
    expect(api.reads()).toContain('refresh-hm');

    const secret = randomBytes(18).toString('hex');
    const interviewId = proposed.body.data!.interview.id;
    await t.handle.db.update(schema.interview).set({ tokenHash: createHash('sha256').update(secret).digest('hex') }).where(eq(schema.interview.id, interviewId));
    const page = await t.app.inject({ method: 'GET', url: `/api/v1/public/interviews/${secret}` });
    const slot = (page.json().data as { slots: string[] }).slots[0]!;
    const booked = await t.app.inject({ method: 'POST', url: `/api/v1/public/interviews/${secret}/book`, payload: { slot } });
    expect(booked.statusCode).toBe(200);

    const [event] = api.events();
    expect(event).toMatchObject({ refreshToken: 'refresh-hm', start: new Date(slot) });
    const [stored] = await t.handle.db.select().from(schema.interview).where(eq(schema.interview.id, interviewId));
    expect(stored?.location).toBe(event?.meetUrl);
    const rows = await t.handle.db.select().from(schema.interviewCalendarEvent).where(eq(schema.interviewCalendarEvent.interviewId, interviewId));
    expect(rows).toMatchObject([{ externalEventId: event?.id }]);
  });
});
