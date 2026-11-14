import { describe, expect, it, vi } from 'vitest';
import { createGoogleCalendarApi, GOOGLE_CALENDAR_API_URL } from './google-calendar-api.js';
import { GOOGLE_TOKEN_URL } from './google-oauth.js';

const CLIENT = { clientId: 'client-123.apps.googleusercontent.com', clientSecret: 'not-a-real-secret' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const WINDOW = { from: new Date('2026-11-16T07:00:00Z'), to: new Date('2026-12-16T07:00:00Z') };
const EVENT = {
  summary: 'Backend developer: Technical (Acme)',
  description: 'Anna Rossi',
  start: new Date('2026-11-17T09:00:00Z'),
  end: new Date('2026-11-17T10:00:00Z'),
  location: null,
  meet: { requestId: 'interview-1' },
};

interface Call {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
  readonly authorization: string | undefined;
}

/** Google: the token endpoint answers `token`, the calendar API answers `api` (per call, in order). */
const google = (api: ((call: Call) => Response)[], token: () => Response = () => json({ access_token: 'access-xyz', expires_in: 3599 })) => {
  const calls: Call[] = [];
  let next = 0;
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const call = { url: String(url), method: init?.method ?? 'GET', body, authorization: (init?.headers as Record<string, string> | undefined)?.authorization };
    calls.push(call);
    if (call.url === GOOGLE_TOKEN_URL) return token();
    const answer = api[next];
    next += 1;
    if (!answer) throw new Error('unexpected call');
    return answer(call);
  });
  return { api: createGoogleCalendarApi({ ...CLIENT, fetchImpl: fetchImpl as unknown as typeof fetch }), calls };
};

describe('the access token', () => {
  it('is traded for the refresh token at every call and sent as a bearer', async () => {
    const { api, calls } = google([() => json({ calendars: { primary: { busy: [] } } })]);
    await api.readBusy('refresh-abc', WINDOW);
    expect(calls[0]).toMatchObject({ url: GOOGLE_TOKEN_URL, body: { grant_type: 'refresh_token', refresh_token: 'refresh-abc', ...{ client_id: CLIENT.clientId, client_secret: CLIENT.clientSecret } } });
    expect(calls[1]?.authorization).toBe('Bearer access-xyz');
  });

  it('says the grant is gone when Google answers invalid_grant, and refused or unreachable otherwise', async () => {
    expect(await google([], () => json({ error: 'invalid_grant' }, 400)).api.readBusy('x', WINDOW)).toEqual({ ok: false, error: 'revoked' });
    expect(await google([], () => json({ error: 'invalid_client' }, 401)).api.readBusy('x', WINDOW)).toEqual({ ok: false, error: 'revoked' });
    expect(await google([], () => json({ error: 'unauthorized_client' }, 400)).api.readBusy('x', WINDOW)).toEqual({ ok: false, error: 'refused' });
    expect(await google([], () => new Response('', { status: 503 })).api.readBusy('x', WINDOW)).toEqual({ ok: false, error: 'unreachable' });
    const down = google([], () => {
      throw new Error('ECONNRESET');
    });
    expect(await down.api.readBusy('x', WINDOW)).toEqual({ ok: false, error: 'unreachable' });
  });
});

describe('readBusy', () => {
  it('asks freeBusy for the primary calendar in the window, and keeps only the intervals', async () => {
    const { api, calls } = google([() => json({ kind: 'calendar#freeBusy', calendars: { primary: { busy: [{ start: '2026-11-17T09:00:00Z', end: '2026-11-17T10:00:00Z' }] } } })]);
    expect(await api.readBusy('refresh-abc', WINDOW)).toEqual({ ok: true, value: [{ start: new Date('2026-11-17T09:00:00Z'), end: new Date('2026-11-17T10:00:00Z') }] });
    expect(calls[1]).toMatchObject({ url: `${GOOGLE_CALENDAR_API_URL}/freeBusy`, method: 'POST', body: { timeMin: WINDOW.from.toISOString(), timeMax: WINDOW.to.toISOString(), items: [{ id: 'primary' }] } });
  });

  it('refuses an answer it cannot trust or a calendar Google could not read', async () => {
    expect(await google([() => json({ calendars: {} })]).api.readBusy('x', WINDOW)).toEqual({ ok: false, error: 'refused' });
    expect(await google([() => json({ calendars: { primary: { busy: [], errors: [{ reason: 'notFound' }] } } })]).api.readBusy('x', WINDOW)).toEqual({ ok: false, error: 'refused' });
    expect(await google([() => json({ error: {} }, 403)]).api.readBusy('x', WINDOW)).toEqual({ ok: false, error: 'refused' });
    expect(await google([() => new Response('x'.repeat(300_000))]).api.readBusy('x', WINDOW)).toEqual({ ok: false, error: 'refused' });
  });
});

describe('createEvent', () => {
  it('writes a private event with a Meet request and no email from Google, and returns the Meet', async () => {
    const { api, calls } = google([() => json({ id: 'event-1', hangoutLink: 'https://meet.google.com/abc-defg-hij' })]);
    expect(await api.createEvent('refresh-abc', EVENT)).toEqual({ ok: true, value: { eventId: 'event-1', meetUrl: 'https://meet.google.com/abc-defg-hij' } });
    expect(calls[1]?.url).toBe(`${GOOGLE_CALENDAR_API_URL}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none`);
    expect(calls[1]?.body).toEqual({
      summary: EVENT.summary,
      description: 'Anna Rossi',
      start: { dateTime: '2026-11-17T09:00:00.000Z' },
      end: { dateTime: '2026-11-17T10:00:00.000Z' },
      visibility: 'private',
      conferenceData: { createRequest: { requestId: 'interview-1', conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    });
  });

  it('reads the event once more when the Meet is not ready, and accepts only a Meet address', async () => {
    const pending = google([() => json({ id: 'event-1' }), () => json({ id: 'event-1', conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }] } })]);
    expect(await pending.api.createEvent('x', EVENT)).toEqual({ ok: true, value: { eventId: 'event-1', meetUrl: 'https://meet.google.com/abc-defg-hij' } });
    expect(pending.calls.at(-1)).toMatchObject({ url: `${GOOGLE_CALENDAR_API_URL}/calendars/primary/events/event-1`, method: 'GET' });
    const odd = google([() => json({ id: 'event-1', hangoutLink: 'https://evil.example/meet' }), () => json({ id: 'event-1' })]);
    expect(await odd.api.createEvent('x', EVENT)).toEqual({ ok: true, value: { eventId: 'event-1', meetUrl: null } });
  });

  it('writes the place of an in-person interview and asks for no Meet', async () => {
    const { api, calls } = google([() => json({ id: 'event-2' })]);
    expect(await api.createEvent('x', { ...EVENT, location: 'Via Roma 1', meet: null })).toEqual({ ok: true, value: { eventId: 'event-2', meetUrl: null } });
    expect(calls[1]?.body).toMatchObject({ location: 'Via Roma 1' });
    expect(calls[1]?.body).not.toHaveProperty('conferenceData');
    expect(calls).toHaveLength(2);
  });

  it('fails with a code when Google refuses', async () => {
    expect(await google([() => json({ error: {} }, 403)]).api.createEvent('x', EVENT)).toEqual({ ok: false, error: 'refused' });
    expect(await google([() => json({ error: {} }, 401)]).api.createEvent('x', EVENT)).toEqual({ ok: false, error: 'revoked' });
    expect(await google([() => json({ nope: true })]).api.createEvent('x', EVENT)).toEqual({ ok: false, error: 'refused' });
  });
});

describe('moving and deleting the event', () => {
  it('patches the time of the same event, without email', async () => {
    const { api, calls } = google([() => json({ id: 'event/1' })]);
    expect(await api.moveEvent('x', 'event/1', { start: EVENT.start, end: EVENT.end })).toEqual({ ok: true, value: null });
    expect(calls[1]).toMatchObject({ method: 'PATCH', url: `${GOOGLE_CALENDAR_API_URL}/calendars/primary/events/event%2F1?conferenceDataVersion=1&sendUpdates=none`, body: { start: { dateTime: '2026-11-17T09:00:00.000Z' } } });
    expect(await google([() => json({}, 404)]).api.moveEvent('x', 'gone', { start: EVENT.start, end: EVENT.end })).toEqual({ ok: false, error: 'refused' });
  });

  it('deletes the event, and an event already gone counts as deleted', async () => {
    const { api, calls } = google([() => new Response(null, { status: 204 })]);
    expect(await api.deleteEvent('x', 'event-1')).toEqual({ ok: true, value: null });
    expect(calls[1]).toMatchObject({ method: 'DELETE', url: `${GOOGLE_CALENDAR_API_URL}/calendars/primary/events/event-1?sendUpdates=none` });
    expect(await google([() => json({}, 410)]).api.deleteEvent('x', 'event-1')).toEqual({ ok: true, value: null });
    expect(await google([() => json({}, 500)]).api.deleteEvent('x', 'event-1')).toEqual({ ok: false, error: 'unreachable' });
  });
});
