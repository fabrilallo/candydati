import { DEFAULT_WORKING_HOURS } from '@candydati/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { busy, createCalendarWorld, type CalendarWorld } from '../../testing/calendar-deps.js';
import { agentActor, apiKeyActor, userActor } from '../../testing/actors.js';
import { getMyCalendarFeed, removeCalendarFeed, saveCalendarFeed, updateCalendarPreferences } from './feed.js';

const URL = 'https://calendar.google.com/calendar/ical/anna%40example.com/private-0123456789abcdef/basic.ics';
const anna = userActor({ id: 'anna', role: 'interviewer' });
const input = { url: URL, timeZone: 'Europe/Rome', workingHours: DEFAULT_WORKING_HOURS };

let world: CalendarWorld;
beforeEach(() => {
  world = createCalendarWorld();
  world.calendarReader.serve(URL, { ok: true, busy: [busy('2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z')] });
});

describe('connecting my calendar', () => {
  it('reads the address once, seals it and shows only the host back', async () => {
    const view = await saveCalendarFeed(world, anna, input);
    expect(view).toEqual({ connected: true, host: 'calendar.google.com', timeZone: 'Europe/Rome', workingHours: DEFAULT_WORKING_HOURS, fetchedAt: world.now(), lastError: null });
    const [stored] = world.calendarFeeds.all();
    expect(stored?.urlCiphertext).not.toContain('private-0123456789abcdef');
    expect(world.calendarSecrets.open(stored?.urlCiphertext ?? '', 'calendar-feed:org_test:anna')).toBe(URL);
    expect(stored?.busy).toEqual([busy('2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z')]);
    expect(JSON.stringify(await getMyCalendarFeed(world, anna, {}))).not.toContain('private-');
  });

  it('audits the save with the host only, never the address', async () => {
    await saveCalendarFeed(world, anna, input);
    const [event] = world.auditLog.events();
    expect(event).toMatchObject({ action: 'calendar_feed.saved', target: { type: 'calendar_feed', id: 'anna' }, metadata: { host: 'calendar.google.com' } });
    expect(JSON.stringify(event)).not.toContain('private-');
  });

  it('refuses an address it cannot read, and says why', async () => {
    world.calendarReader.serve(URL, { ok: false, error: 'not_calendar' });
    await expect(saveCalendarFeed(world, anna, input)).rejects.toMatchObject({ issues: [{ path: 'url', message: 'calendar_not_calendar' }] });
    expect(world.calendarFeeds.all()).toEqual([]);
  });

  it('refuses plain http before reading anything', async () => {
    await expect(saveCalendarFeed(world, anna, { ...input, url: 'http://calendar.example.com/a.ics' })).rejects.toMatchObject({ name: 'ValidationError' });
    expect(world.calendarReader.reads()).toEqual([]);
  });

  it('is personal: never through an API key or the assistant', async () => {
    await expect(saveCalendarFeed(world, apiKeyActor(), input)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(getMyCalendarFeed(world, agentActor(), {})).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  it('keeps each person’s calendar to themselves', async () => {
    await saveCalendarFeed(world, anna, input);
    expect((await getMyCalendarFeed(world, userActor({ id: 'luca' }), {})).connected).toBe(false);
    expect((await getMyCalendarFeed(world, userActor({ id: 'anna', organizationId: 'org_other' }), {})).connected).toBe(false);
  });
});

describe('changing hours and disconnecting', () => {
  it('changes working hours and time zone without the address', async () => {
    await saveCalendarFeed(world, anna, input);
    const hours = { days: [1, 3], start: '10:00', end: '13:00' };
    const view = await updateCalendarPreferences(world, anna, { timeZone: 'Europe/London', workingHours: hours });
    expect(view).toMatchObject({ timeZone: 'Europe/London', workingHours: hours, connected: true });
    await expect(updateCalendarPreferences(world, userActor({ id: 'luca' }), { timeZone: 'Europe/London', workingHours: hours })).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('removes the address and the busy times, audited once', async () => {
    await saveCalendarFeed(world, anna, input);
    expect(await removeCalendarFeed(world, anna, {})).toEqual({ removed: true });
    expect(world.calendarFeeds.all()).toEqual([]);
    expect(await removeCalendarFeed(world, anna, {})).toEqual({ removed: false });
    expect(world.auditLog.events().map((event) => event.action)).toEqual(['calendar_feed.saved', 'calendar_feed.removed']);
  });
});
