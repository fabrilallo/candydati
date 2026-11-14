import { beforeEach, describe, expect, it } from 'vitest';
import { busy, fakeSecretBox } from '../../testing/calendar-deps.js';
import { createFakeGoogleCalendarApi, createInMemoryCalendarConnections, googleConnectionOf, type FakeGoogleCalendarApi } from '../../testing/calendar-connection-deps.js';
import { refreshGoogleCalendars, type GoogleBusyDeps } from './google-busy.js';

const ORG = 'org_test';
const meeting = busy('2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z');
const later = busy('2026-11-17T09:00:00Z', '2026-11-17T10:00:00Z');

let google: FakeGoogleCalendarApi;
let deps: GoogleBusyDeps & { calendarConnections: ReturnType<typeof createInMemoryCalendarConnections> };
let now: Date;

beforeEach(async () => {
  google = createFakeGoogleCalendarApi();
  now = new Date('2026-11-16T07:00:00Z');
  deps = { calendarConnections: createInMemoryCalendarConnections(), connectionSecrets: fakeSecretBox, googleCalendarApi: google, now: () => now };
  await deps.calendarConnections.save(googleConnectionOf(ORG, 'anna'));
  google.serveBusy('refresh-anna', [meeting]);
});

describe('busy times from Google Calendar', () => {
  it('reads freeBusy with the person’s token and keeps only the intervals', async () => {
    const [anna] = await refreshGoogleCalendars(deps, ORG, ['anna', 'luca'], 0);
    expect(anna).toMatchObject({ userId: 'anna', busy: [meeting], fetchedAt: now, lastError: null });
    expect(google.reads()).toEqual(['refresh-anna']);
    expect((await deps.calendarConnections.find(ORG, 'anna', 'google'))?.busy).toEqual([meeting]);
  });

  it('reads again only when older than the limit', async () => {
    await refreshGoogleCalendars(deps, ORG, ['anna'], 0);
    now = new Date(now.getTime() + 4 * 60_000);
    google.serveBusy('refresh-anna', [meeting, later]);
    expect((await refreshGoogleCalendars(deps, ORG, ['anna'], 5 * 60_000))[0]?.busy).toEqual([meeting]);
    expect((await refreshGoogleCalendars(deps, ORG, ['anna'], 0))[0]?.busy).toEqual([meeting, later]);
  });

  it('keeps the last busy times when Google cannot be reached', async () => {
    await refreshGoogleCalendars(deps, ORG, ['anna'], 0);
    google.fail('refresh-anna', 'unreachable');
    const [anna] = await refreshGoogleCalendars(deps, ORG, ['anna'], 0);
    expect(anna).toMatchObject({ busy: [meeting], lastError: 'unreachable', status: 'active' });
  });

  it('breaks the connection when Google no longer honours the grant, and leaves the person out', async () => {
    google.fail('refresh-anna', 'revoked');
    expect(await refreshGoogleCalendars(deps, ORG, ['anna'], 0)).toEqual([]);
    expect(await deps.calendarConnections.find(ORG, 'anna', 'google')).toMatchObject({ status: 'broken', lastError: 'revoked' });
    expect(await refreshGoogleCalendars(deps, ORG, ['anna'], 0)).toEqual([]);
    expect(google.reads()).toEqual(['refresh-anna']);
  });

  it('breaks a connection whose sealed token no longer opens', async () => {
    await deps.calendarConnections.save(googleConnectionOf(ORG, 'anna', { refreshTokenCiphertext: 'garbage' }));
    expect(await refreshGoogleCalendars(deps, ORG, ['anna'], 0)).toEqual([]);
    expect((await deps.calendarConnections.find(ORG, 'anna', 'google'))?.status).toBe('broken');
  });

  it('ignores every connection when the instance has no Google app', async () => {
    expect(await refreshGoogleCalendars({ ...deps, googleCalendarApi: null }, ORG, ['anna'], 0)).toEqual([]);
  });
});
