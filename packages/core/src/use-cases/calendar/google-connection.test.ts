import { GOOGLE_CALENDAR_REQUIRED_SCOPES } from '@candydati/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../errors.js';
import { agentActor, apiKeyActor, userActor } from '../../testing/actors.js';
import { createCalendarConnectionWorld, type CalendarConnectionWorld } from '../../testing/calendar-connection-deps.js';
import {
  beginGoogleCalendarConnection,
  completeGoogleCalendarConnection,
  disconnectGoogleCalendar,
  getMyCalendarConnection,
  type PendingGoogleConnection,
} from './google-connection.js';

const REDIRECT = 'https://ats.example.com/api/v1/me/calendar/google/callback';
const SCOPES = `openid ${GOOGLE_CALENDAR_REQUIRED_SCOPES.join(' ')} https://www.googleapis.com/auth/userinfo.email`;
const anna = userActor({ id: 'anna', role: 'interviewer' });
const marco = userActor({ id: 'marco', role: 'recruiter' });

let world: CalendarConnectionWorld;
beforeEach(() => {
  world = createCalendarConnectionWorld();
  world.googleCalendar?.grant('good-code', { refreshToken: 'refresh-1', accountEmail: 'anna@example.com', scopes: SCOPES });
});

const start = async (): Promise<PendingGoogleConnection> => (await beginGoogleCalendarConnection(world, anna, { redirectUri: REDIRECT })).pending;
const finish = (pending: PendingGoogleConnection | null, query: Record<string, string>, actor = anna) =>
  completeGoogleCalendarConnection(world, actor, { query, pending, redirectUri: REDIRECT });

describe('connecting Google Calendar', () => {
  it('is offered only when the instance has a Google app', async () => {
    expect(await getMyCalendarConnection(world, anna, {})).toEqual({ available: true, connection: null });
    const bare = createCalendarConnectionWorld({ google: false });
    expect(await getMyCalendarConnection(bare, anna, {})).toEqual({ available: false, connection: null });
    await expect(beginGoogleCalendarConnection(bare, anna, { redirectUri: REDIRECT })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('sends the person to Google with a state and a PKCE verifier bound to them', async () => {
    const started = await beginGoogleCalendarConnection(world, anna, { redirectUri: REDIRECT });
    expect(started.pending).toEqual({ state: 'random-1', codeVerifier: 'random-2', organizationId: 'org_test', userId: 'anna' });
    const url = new URL(started.location);
    expect(url.searchParams.get('state')).toBe('random-1');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(started.location).not.toContain('random-2');
  });

  it('keeps the refresh token sealed and shows only the address', async () => {
    const pending = await start();
    expect(await finish(pending, { code: 'good-code', state: pending.state })).toEqual({ outcome: 'connected' });
    expect(world.googleCalendar?.exchanges()).toEqual([{ code: 'good-code', codeVerifier: pending.codeVerifier, redirectUri: REDIRECT }]);
    const [stored] = world.calendarConnections.all();
    expect(stored).toMatchObject({ organizationId: 'org_test', userId: 'anna', provider: 'google', accountEmail: 'anna@example.com', status: 'active' });
    expect(stored?.refreshTokenCiphertext).not.toContain('refresh-1');
    expect(world.connectionSecrets.open(stored?.refreshTokenCiphertext ?? '', 'calendar-connection:google:org_test:anna')).toBe('refresh-1');
    const status = await getMyCalendarConnection(world, anna, {});
    expect(status).toEqual({ available: true, connection: { provider: 'google', accountEmail: 'anna@example.com', status: 'active', connectedAt: world.now() } });
    expect(JSON.stringify(status)).not.toContain('refresh');
    expect(world.auditLog.events()).toMatchObject([{ action: 'calendar_connection.connected', target: { type: 'calendar_connection', id: 'anna' }, metadata: { provider: 'google' } }]);
  });

  it('refuses a callback whose state does not match, without calling Google', async () => {
    const pending = await start();
    expect(await finish(pending, { code: 'good-code', state: 'forged' })).toEqual({ outcome: 'failed' });
    expect(world.googleCalendar?.exchanges()).toEqual([]);
    expect(world.problems()).toMatchObject([{ reason: 'state_mismatch' }]);
    expect(world.calendarConnections.all()).toEqual([]);
  });

  it('says the attempt expired when the browser lost the pending login', async () => {
    expect(await finish(null, { code: 'good-code', state: 'random-1' })).toEqual({ outcome: 'expired' });
    expect(world.googleCalendar?.exchanges()).toEqual([]);
  });

  it('never connects a calendar to someone other than who started', async () => {
    const pending = await start();
    expect(await finish(pending, { code: 'good-code', state: pending.state }, marco)).toEqual({ outcome: 'failed' });
    expect(world.problems()).toMatchObject([{ reason: 'other_person' }]);
    expect(world.calendarConnections.all()).toEqual([]);
  });

  it('tells a cancelled consent apart from an error', async () => {
    const pending = await start();
    expect(await finish(pending, { error: 'access_denied', state: pending.state })).toEqual({ outcome: 'cancelled' });
    expect(await finish(pending, { error: 'server_error', state: pending.state })).toEqual({ outcome: 'failed' });
    expect(world.problems()).toMatchObject([{ reason: 'google_error', detail: 'server_error' }]);
  });

  it('refuses a query it does not understand', async () => {
    const pending = await start();
    expect(await finish(pending, { state: pending.state })).toEqual({ outcome: 'failed' });
    expect(await finish(pending, { code: 'x'.repeat(5000), state: pending.state })).toEqual({ outcome: 'failed' });
    expect(world.problems().map((problem) => problem.reason)).toEqual(['invalid_query', 'invalid_query']);
  });

  it('fails softly when Google refuses the code', async () => {
    const pending = await start();
    expect(await finish(pending, { code: 'bad-code', state: pending.state })).toEqual({ outcome: 'failed' });
    expect(world.problems()).toMatchObject([{ reason: 'exchange_failed' }]);
    expect(world.auditLog.events()).toEqual([]);
  });

  it('keeps nothing when a calendar scope was unticked, and gives the grant back', async () => {
    world.googleCalendar?.grant('partial', { refreshToken: 'refresh-2', accountEmail: 'anna@example.com', scopes: 'openid email https://www.googleapis.com/auth/calendar.freebusy' });
    const pending = await start();
    expect(await finish(pending, { code: 'partial', state: pending.state })).toEqual({ outcome: 'missing_scope' });
    expect(world.calendarConnections.all()).toEqual([]);
    expect(world.googleCalendar?.revoked()).toEqual(['refresh-2']);
  });

  it('replaces an earlier connection and keeps when it was first made', async () => {
    const first = await start();
    await finish(first, { code: 'good-code', state: first.state });
    world.googleCalendar?.grant('again', { refreshToken: 'refresh-3', accountEmail: 'anna.work@example.com', scopes: SCOPES });
    const second = await start();
    expect(await finish(second, { code: 'again', state: second.state })).toEqual({ outcome: 'connected' });
    expect(world.calendarConnections.all()).toHaveLength(1);
    expect(world.calendarConnections.all()[0]?.accountEmail).toBe('anna.work@example.com');
  });

  it('is personal: no API key and no assistant', async () => {
    for (const actor of [apiKeyActor(), agentActor()]) {
      await expect(getMyCalendarConnection(world, actor, {})).rejects.toThrow(/Only a person/);
      await expect(beginGoogleCalendarConnection(world, actor, { redirectUri: REDIRECT })).rejects.toThrow(/Only a person/);
      await expect(disconnectGoogleCalendar(world, actor, {})).rejects.toThrow(/Only a person/);
    }
  });
});

describe('disconnecting Google Calendar', () => {
  it('gives the grant back to Google and forgets the token', async () => {
    const pending = await start();
    await finish(pending, { code: 'good-code', state: pending.state });
    expect(await disconnectGoogleCalendar(world, anna, {})).toEqual({ removed: true });
    expect(world.googleCalendar?.revoked()).toEqual(['refresh-1']);
    expect(world.calendarConnections.all()).toEqual([]);
    expect(world.auditLog.events().map((event) => event.action)).toEqual(['calendar_connection.connected', 'calendar_connection.removed']);
  });

  it('forgets the token even when Google cannot be reached', async () => {
    const pending = await start();
    await finish(pending, { code: 'good-code', state: pending.state });
    world.googleCalendar?.failRevoke();
    expect(await disconnectGoogleCalendar(world, anna, {})).toEqual({ removed: true });
    expect(world.calendarConnections.all()).toEqual([]);
    expect(world.problems()).toMatchObject([{ reason: 'revoke_failed' }]);
  });

  it('does nothing when there is no connection', async () => {
    expect(await disconnectGoogleCalendar(world, anna, {})).toEqual({ removed: false });
    expect(world.auditLog.events()).toEqual([]);
  });
});
