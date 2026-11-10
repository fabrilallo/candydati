import { and, eq, schema } from '@candydati/db';
import type { CalendarReadResult, CalendarReader } from '@candydati/core';
import { DEFAULT_WORKING_HOURS } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey } from './testing/api-keys.js';
import { createWorld, userIdOf } from './testing/candidate-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

const SECRET = 'private-0123456789abcdef0123456789abcdef';
const URL = `https://calendar.google.com/calendar/ical/anna%40example.com/${SECRET}/basic.ics`;
const served = new Map<string, CalendarReadResult>([[URL, { ok: true, busy: [{ start: new Date('2026-11-16T09:00:00Z'), end: new Date('2026-11-16T10:00:00Z') }] }]]);
const reader: CalendarReader = { readBusy: async (url) => served.get(url) ?? { ok: false, error: 'unreachable' } };

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ calendarReader: reader });
});
afterAll(async () => {
  await t.close();
});

const FEED = '/api/v1/me/calendar-feed';
const body = { url: URL, timeZone: 'Europe/Rome', workingHours: DEFAULT_WORKING_HOURS };

describe('my calendar link', () => {
  it('connects, reads back without the address, changes hours and disconnects', async () => {
    const w = await createWorld(t);
    const interviewer = await w.member('interviewer');
    expect((await interviewer.get<{ connected: boolean }>(FEED)).body.data).toMatchObject({ connected: false });
    const saved = await interviewer.put<{ connected: boolean; host: string }>(FEED, body);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ connected: true, host: 'calendar.google.com', timeZone: 'Europe/Rome', lastError: null });
    const read = await interviewer.download(FEED);
    expect(read.body).not.toContain(SECRET);
    expect(read.headers['cache-control']).toBe('no-store');
    const [row] = await t.handle.db.select().from(schema.calendarFeed).where(eq(schema.calendarFeed.userId, await userIdOf(interviewer)));
    expect(row?.urlCiphertext).not.toContain(SECRET);
    expect(row?.busy).toEqual([{ start: '2026-11-16T09:00:00.000Z', end: '2026-11-16T10:00:00.000Z' }]);
    const hours = { days: [1, 2], start: '10:00', end: '12:00' };
    expect((await interviewer.patch(FEED, { timeZone: 'Europe/London', workingHours: hours })).body.data).toMatchObject({ timeZone: 'Europe/London', workingHours: hours });
    expect((await interviewer.delete(FEED)).body.data).toEqual({ removed: true });
    expect((await interviewer.get<{ connected: boolean }>(FEED)).body.data).toMatchObject({ connected: false });
  });

  it('refuses an address it cannot read, plain http, and an API key', async () => {
    const w = await createWorld(t);
    const refused = await w.owner.put(FEED, { ...body, url: 'https://calendar.google.com/calendar/ical/x/private-wrong/basic.ics' });
    expect(refused.status).toBe(422);
    expect(JSON.stringify(refused.body)).toContain('calendar_unreachable');
    expect((await w.owner.put(FEED, { ...body, url: 'http://calendar.example.com/a.ics' })).status).toBe(422);
    const key = await createKey(w.owner, ['job:read']);
    expect((await t.app.inject({ method: 'GET', url: FEED, headers: { authorization: `Bearer ${key.secret}` } })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'GET', url: FEED })).statusCode).toBe(401);
  });

  it('goes when the person leaves the organization', async () => {
    const w = await createWorld(t);
    const recruiter = await w.member('recruiter');
    expect((await recruiter.put(FEED, body)).status).toBe(200);
    const userId = await userIdOf(recruiter);
    const list = (await w.owner.get<unknown>('/api/auth/organization/list-members')).body as unknown as { members: { id: string; userId: string }[] };
    const member = list.members.find((m) => m.userId === userId)!;
    expect((await w.owner.post('/api/auth/organization/remove-member', { memberIdOrEmail: member.id })).status).toBe(200);
    const rows = await t.handle.db.select().from(schema.calendarFeed).where(and(eq(schema.calendarFeed.userId, userId)));
    expect(rows).toEqual([]);
  });
});
