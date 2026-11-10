import { DEFAULT_WORKING_HOURS } from '@candydati/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { userActor } from '../../testing/actors.js';
import { busy, createCalendarWorld, type CalendarWorld } from '../../testing/calendar-deps.js';
import { saveCalendarFeed } from './feed.js';
import { refreshCalendars } from './refresh.js';

const ANNA = 'https://calendar.google.com/calendar/ical/anna/private-a/basic.ics';
const LUCA = 'https://outlook.office365.com/owa/calendar/luca/reachcalendar.ics';
const first = busy('2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z');
const second = busy('2026-11-17T09:00:00Z', '2026-11-17T10:00:00Z');

let world: CalendarWorld;
beforeEach(async () => {
  world = createCalendarWorld();
  world.calendarReader.serve(ANNA, { ok: true, busy: [first] });
  world.calendarReader.serve(LUCA, { ok: true, busy: [] });
  for (const [id, url] of [['anna', ANNA], ['luca', LUCA]] as const) {
    await saveCalendarFeed(world, userActor({ id }), { url, timeZone: 'Europe/Rome', workingHours: DEFAULT_WORKING_HOURS });
  }
});

describe('refreshing calendars before showing times', () => {
  it('reads again only the calendars older than the limit', async () => {
    world.setNow(new Date(world.now().getTime() + 4 * 60_000));
    await refreshCalendars(world, 'org_test', ['anna', 'luca'], 5 * 60_000);
    expect(world.calendarReader.reads()).toEqual([ANNA, LUCA]);
    world.calendarReader.serve(ANNA, { ok: true, busy: [first, second] });
    const feeds = await refreshCalendars(world, 'org_test', ['anna'], 0);
    expect(feeds.map((feed) => feed.busy)).toEqual([[first, second]]);
    expect((await world.calendarFeeds.find('org_test', 'anna'))?.busy).toEqual([first, second]);
  });

  it('keeps the last busy times when a read fails, and records why', async () => {
    world.calendarReader.serve(ANNA, { ok: false, error: 'unreachable' });
    const [anna] = await refreshCalendars(world, 'org_test', ['anna'], 0);
    expect(anna).toMatchObject({ busy: [first], lastError: 'unreachable' });
  });

  it('marks a calendar whose sealed address no longer opens', async () => {
    const stored = await world.calendarFeeds.find('org_test', 'anna');
    await world.calendarFeeds.save({ ...stored!, urlCiphertext: 'garbage' });
    const [anna] = await refreshCalendars(world, 'org_test', ['anna'], 0);
    expect(anna).toMatchObject({ busy: [first], lastError: 'unreachable' });
  });

  it('returns nobody for people without a calendar', async () => {
    expect(await refreshCalendars(world, 'org_test', ['nobody'], 0)).toEqual([]);
  });
});
