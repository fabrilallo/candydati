import { describe, expect, it } from 'vitest';
import { CalendarParseError, parseBusy, type BusyWindow } from './busy.js';

const window: BusyWindow = { from: new Date('2026-11-16T00:00:00Z'), to: new Date('2026-11-30T00:00:00Z'), timeZone: 'Europe/Rome' };
const calendar = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', ...events, 'END:VCALENDAR'].join('\r\n');
const event = (lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
const iso = (intervals: readonly { start: Date; end: Date }[]) => intervals.map((i) => `${i.start.toISOString()}/${i.end.toISOString()}`);

const ROME_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:W. Europe Standard Time',
  'BEGIN:STANDARD',
  'DTSTART:16010101T030000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:16010101T020000',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
].join('\r\n');

describe('busy times from a calendar feed', () => {
  it('reads UTC and IANA-zoned events and keeps nothing but the times', () => {
    const text = calendar(
      event(['UID:a', 'SUMMARY:Salary review with Anna', 'DTSTART:20261116T090000Z', 'DTEND:20261116T100000Z']),
      event(['UID:b', 'SUMMARY:Dentist', 'DTSTART;TZID=Europe/Rome:20261117T150000', 'DTEND;TZID=Europe/Rome:20261117T160000']),
    );
    const busy = parseBusy(text, window);
    expect(iso(busy)).toEqual(['2026-11-16T09:00:00.000Z/2026-11-16T10:00:00.000Z', '2026-11-17T14:00:00.000Z/2026-11-17T15:00:00.000Z']);
    expect(Object.keys(busy[0]!)).toEqual(['start', 'end']);
  });

  it('uses the VTIMEZONE of the feed for Windows zone names (Outlook)', () => {
    const text = calendar(ROME_VTIMEZONE, event(['UID:o', 'DTSTART;TZID=W. Europe Standard Time:20261118T100000', 'DTEND;TZID=W. Europe Standard Time:20261118T113000']));
    expect(iso(parseBusy(text, window))).toEqual(['2026-11-18T09:00:00.000Z/2026-11-18T10:30:00.000Z']);
  });

  it('expands a weekly meeting, minus excluded dates, with a moved occurrence', () => {
    const text = calendar(
      event(['UID:weekly', 'DTSTART;TZID=Europe/Rome:20261102T100000', 'DTEND;TZID=Europe/Rome:20261102T103000', 'RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXDATE;TZID=Europe/Rome:20261116T100000']),
      event(['UID:weekly', 'RECURRENCE-ID;TZID=Europe/Rome:20261123T100000', 'DTSTART;TZID=Europe/Rome:20261123T140000', 'DTEND;TZID=Europe/Rome:20261123T143000']),
    );
    // The 16th is excluded, the 23rd moved to 14:00, nothing after the window.
    expect(iso(parseBusy(text, window))).toEqual(['2026-11-23T13:00:00.000Z/2026-11-23T13:30:00.000Z']);
  });

  it('skips free and cancelled events, keeps an all-day busy day in the person’s zone', () => {
    const text = calendar(
      event(['UID:free', 'DTSTART:20261116T090000Z', 'DTEND:20261116T100000Z', 'TRANSP:TRANSPARENT']),
      event(['UID:gone', 'DTSTART:20261116T110000Z', 'DTEND:20261116T120000Z', 'STATUS:CANCELLED']),
      event(['UID:holiday', 'DTSTART;VALUE=DATE:20261119', 'DTEND;VALUE=DATE:20261120']),
    );
    expect(iso(parseBusy(text, window))).toEqual(['2026-11-18T23:00:00.000Z/2026-11-19T23:00:00.000Z']);
  });

  it('reads floating times in the person’s zone, clips to the window and merges overlaps', () => {
    const text = calendar(
      event(['UID:f', 'DTSTART:20261120T090000', 'DTEND:20261120T110000']),
      event(['UID:g', 'DTSTART:20261120T093000Z', 'DTEND:20261120T120000Z']),
      event(['UID:early', 'DTSTART:20261115T230000Z', 'DTEND:20261116T010000Z']),
      event(['UID:late', 'DTSTART:20261201T090000Z', 'DTEND:20261201T100000Z']),
    );
    expect(iso(parseBusy(text, window))).toEqual(['2026-11-16T00:00:00.000Z/2026-11-16T01:00:00.000Z', '2026-11-20T08:00:00.000Z/2026-11-20T12:00:00.000Z']);
  });

  it('refuses what is not a calendar', () => {
    expect(() => parseBusy('<html>login</html>', window)).toThrow(CalendarParseError);
    expect(() => parseBusy('BEGIN:VCARD\r\nVERSION:4.0\r\nEND:VCARD', window)).toThrow(CalendarParseError);
  });
});
