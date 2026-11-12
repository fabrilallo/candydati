import { createFakeGoogleCalendarAuth, type FakeGoogleCalendarAuth } from '@candydati/core/testing';
import { and, eq, schema } from '@candydati/db';
import { GOOGLE_CALENDAR_REQUIRED_SCOPES } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey } from './testing/api-keys.js';
import { createWorld, userIdOf } from './testing/candidate-world.js';
import type { TestUser } from './testing/client.js';
import { createTestApp, WEB_ORIGIN, type TestApp } from './testing/test-app.js';

const BASE = '/api/v1/me/calendar/google';
const SCOPES = `openid ${GOOGLE_CALENDAR_REQUIRED_SCOPES.join(' ')}`;

let t: TestApp;
let google: FakeGoogleCalendarAuth;
beforeAll(async () => {
  google = createFakeGoogleCalendarAuth();
  google.grant('good-code', { refreshToken: 'refresh-secret-1', accountEmail: 'anna@example.com', scopes: SCOPES });
  t = await createTestApp({ googleCalendarAuth: google });
});
afterAll(async () => {
  await t.close();
});

const cookiePair = (setCookie: string | string[] | undefined): string => {
  const first = (Array.isArray(setCookie) ? setCookie[0] : setCookie) ?? '';
  return first.split(';')[0] ?? '';
};

/** Start as the browser does, then come back from Google with `query`; returns where the callback sends the person. */
async function roundTrip(user: TestUser, query: (state: string) => string, options: { readonly dropCookie?: boolean } = {}) {
  const start = await t.app.inject({ method: 'GET', url: `${BASE}/start`, headers: { origin: WEB_ORIGIN, cookie: user.cookieHeader() } });
  expect(start.statusCode).toBe(302);
  const state = new URL(String(start.headers.location)).searchParams.get('state') ?? '';
  const pending = cookiePair(start.headers['set-cookie']);
  const cookie = options.dropCookie ? user.cookieHeader() : `${user.cookieHeader()}; ${pending}`;
  const back = await t.app.inject({ method: 'GET', url: `${BASE}/callback?${query(state)}`, headers: { cookie } });
  return { start, back };
}

describe('connecting Google Calendar', () => {
  it('goes to Google with a sealed, HttpOnly cookie and comes back connected', async () => {
    const w = await createWorld(t);
    const recruiter = await w.member('recruiter');
    expect((await recruiter.get(BASE)).body.data).toEqual({ available: true, connection: null });
    const { start, back } = await roundTrip(recruiter, (state) => `code=good-code&state=${state}`);
    const setCookie = String(start.headers['set-cookie']);
    expect(setCookie).toMatch(/^google_calendar_login=.+; Path=\/api\/v1\/me\/calendar\/google; Max-Age=600; HttpOnly; SameSite=Lax/);
    expect(start.headers['cache-control']).toBe('no-store');
    expect(new URL(String(start.headers.location)).searchParams.get('redirect_uri')).toMatch(/\/api\/v1\/me\/calendar\/google\/callback$/);
    expect(back.statusCode).toBe(302);
    expect(back.headers.location).toBe('/app/settings/calendar?google=connected');
    expect(String(back.headers['set-cookie'])).toContain('google_calendar_login=; Path=/api/v1/me/calendar/google; Max-Age=0');

    const status = await recruiter.get<{ connection: { accountEmail: string; status: string } }>(BASE);
    expect(status.body.data?.connection).toMatchObject({ provider: 'google', accountEmail: 'anna@example.com', status: 'active' });
    expect(JSON.stringify(status.body)).not.toContain('refresh-secret-1');
    const rows = await t.handle.db.select().from(schema.calendarConnection).where(eq(schema.calendarConnection.userId, await userIdOf(recruiter)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.refreshTokenCiphertext).not.toContain('refresh-secret-1');
  });

  it('refuses a forged state and a lost cookie', async () => {
    const w = await createWorld(t);
    const recruiter = await w.member('recruiter');
    expect((await roundTrip(recruiter, () => 'code=good-code&state=forged')).back.headers.location).toBe('/app/settings/calendar?google=failed');
    expect((await roundTrip(recruiter, (state) => `code=good-code&state=${state}`, { dropCookie: true })).back.headers.location).toBe('/app/settings/calendar?google=expired');
    expect((await recruiter.get<{ connection: unknown }>(BASE)).body.data?.connection).toBeNull();
  });

  it('never attaches the calendar to another person who comes back with the cookie', async () => {
    const w = await createWorld(t);
    const [anna, marco] = [await w.member('recruiter'), await w.member('interviewer')];
    const start = await t.app.inject({ method: 'GET', url: `${BASE}/start`, headers: { origin: WEB_ORIGIN, cookie: anna.cookieHeader() } });
    const state = new URL(String(start.headers.location)).searchParams.get('state') ?? '';
    const back = await t.app.inject({ method: 'GET', url: `${BASE}/callback?code=good-code&state=${state}`, headers: { cookie: `${marco.cookieHeader()}; ${cookiePair(start.headers['set-cookie'])}` } });
    expect(back.headers.location).toBe('/app/settings/calendar?google=failed');
    expect((await marco.get<{ connection: unknown }>(BASE)).body.data?.connection).toBeNull();
  });

  it('says cancelled when the person said no to Google, and expired without a session', async () => {
    const w = await createWorld(t);
    const recruiter = await w.member('recruiter');
    expect((await roundTrip(recruiter, (state) => `error=access_denied&state=${state}`)).back.headers.location).toBe('/app/settings/calendar?google=cancelled');
    expect((await t.app.inject({ method: 'GET', url: `${BASE}/callback?code=good-code&state=x` })).headers.location).toBe('/app/settings/calendar?google=expired');
  });

  it('is session only: no API key, and nothing without signing in', async () => {
    const w = await createWorld(t);
    const key = await createKey(w.owner, ['job:read']);
    for (const url of [BASE, `${BASE}/start`]) {
      expect((await t.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${key.secret}` } })).statusCode).toBe(403);
      expect((await t.app.inject({ method: 'GET', url })).statusCode).toBe(401);
    }
  });

  it('disconnects: Google is told and the token goes', async () => {
    const w = await createWorld(t);
    const recruiter = await w.member('recruiter');
    await roundTrip(recruiter, (state) => `code=good-code&state=${state}`);
    expect((await recruiter.delete(BASE)).body.data).toEqual({ removed: true });
    expect(google.revoked()).toContain('refresh-secret-1');
    expect((await recruiter.get<{ connection: unknown }>(BASE)).body.data?.connection).toBeNull();
  });

  it('goes when the person leaves the organization', async () => {
    const w = await createWorld(t);
    const recruiter = await w.member('recruiter');
    await roundTrip(recruiter, (state) => `code=good-code&state=${state}`);
    const userId = await userIdOf(recruiter);
    const list = (await w.owner.get<unknown>('/api/auth/organization/list-members')).body as unknown as { members: { id: string; userId: string }[] };
    const member = list.members.find((m) => m.userId === userId)!;
    expect((await w.owner.post('/api/auth/organization/remove-member', { memberIdOrEmail: member.id })).status).toBe(200);
    expect(await t.handle.db.select().from(schema.calendarConnection).where(and(eq(schema.calendarConnection.userId, userId)))).toEqual([]);
  });
});

describe('an instance without a Google app', () => {
  it('does not offer the connection', async () => {
    const bare = await createTestApp({ googleCalendarAuth: null });
    try {
      const w = await createWorld(bare);
      expect((await w.owner.get(BASE)).body.data).toEqual({ available: false, connection: null });
      expect((await bare.app.inject({ method: 'GET', url: `${BASE}/start`, headers: { origin: WEB_ORIGIN, cookie: w.owner.cookieHeader() } })).statusCode).toBe(404);
    } finally {
      await bare.close();
    }
  });
});
