import ICAL from 'ical.js';
import { isTimeZone, wallTimeToInstant, type BusyInterval } from '@candydati/domain';

/**
 * Busy times from an iCalendar feed, and nothing else: no title, description, location or attendee leaves this file.
 * Recurring events are expanded (RRULE, RDATE, EXDATE, moved occurrences); free (TRANSP:TRANSPARENT) and cancelled
 * events are skipped. Time zones come from the feed's own VTIMEZONE or from the IANA name; the global ical.js
 * TimezoneService is never written, so one person's feed cannot change how another's is read.
 */

export class CalendarParseError extends Error {
  constructor() {
    super('calendar: not a calendar');
    this.name = 'CalendarParseError';
  }
}

export interface BusyWindow {
  readonly from: Date;
  readonly to: Date;
  /** For floating times and all-day events. */
  readonly timeZone: string;
}

/** Bounds on a hostile or huge feed. */
const MAX_EVENTS = 20_000;
const MAX_STEPS_PER_EVENT = 50_000;
const MAX_INTERVALS = 5_000;

function instantOf(time: ICAL.Time, tzid: string | null, fallbackZone: string): Date {
  const zone = time.zone;
  const floating = !zone || zone === ICAL.Timezone.localTimezone;
  if (!floating && !time.isDate) return new Date(time.toUnixTime() * 1000);
  const timeZone = tzid && isTimeZone(tzid) ? tzid : fallbackZone;
  const minutes = time.isDate ? 0 : time.hour * 60 + time.minute;
  return wallTimeToInstant({ year: time.year, month: time.month, day: time.day }, minutes, timeZone);
}

const isFree = (component: ICAL.Component): boolean => {
  const transparency = String(component.getFirstPropertyValue('transp') ?? '').toUpperCase();
  const status = String(component.getFirstPropertyValue('status') ?? '').toUpperCase();
  return transparency === 'TRANSPARENT' || status === 'CANCELLED';
};

const tzidOf = (component: ICAL.Component): string | null => {
  const value = component.getFirstProperty('dtstart')?.getParameter('tzid');
  return typeof value === 'string' ? value : null;
};

function parseRoot(text: string): ICAL.Component {
  try {
    const root = new ICAL.Component(ICAL.parse(text) as unknown[]);
    if (root.name !== 'vcalendar') throw new CalendarParseError();
    return root;
  } catch {
    throw new CalendarParseError();
  }
}

/** Masters with their moved occurrences, by UID. */
function eventsOf(root: ICAL.Component): readonly ICAL.Event[] {
  const components = root.getAllSubcomponents('vevent');
  if (components.length > MAX_EVENTS) throw new CalendarParseError();
  const exceptions = components.filter((c) => c.hasProperty('recurrence-id'));
  const masters = components.filter((c) => !c.hasProperty('recurrence-id'));
  const byUid = new Map<string, ICAL.Component[]>();
  for (const exception of exceptions) {
    const uid = String(exception.getFirstPropertyValue('uid') ?? '');
    byUid.set(uid, [...(byUid.get(uid) ?? []), exception]);
  }
  return masters.map((master) => new ICAL.Event(master, { exceptions: byUid.get(String(master.getFirstPropertyValue('uid') ?? '')) ?? [], strictExceptions: true }));
}

function occurrencesOf(event: ICAL.Event, window: BusyWindow): readonly BusyInterval[] {
  const tzid = tzidOf(event.component);
  const toInterval = (start: ICAL.Time, end: ICAL.Time, item: ICAL.Event): BusyInterval | null => {
    if (isFree(item.component)) return null;
    const from = instantOf(start, tzidOf(item.component) ?? tzid, window.timeZone);
    const to = instantOf(end, tzidOf(item.component) ?? tzid, window.timeZone);
    return to > from ? { start: from, end: to } : null;
  };
  if (!event.isRecurring()) {
    const single = event.startDate ? toInterval(event.startDate, event.endDate ?? event.startDate, event) : null;
    return single ? [single] : [];
  }
  const found: BusyInterval[] = [];
  const iterator = event.iterator();
  for (let step = 0, next = iterator.next(); next && step < MAX_STEPS_PER_EVENT; step++, next = iterator.next()) {
    const details = event.getOccurrenceDetails(next);
    const interval = toInterval(details.startDate, details.endDate, details.item);
    if (interval && interval.start >= window.to) break;
    if (interval) found.push(interval);
  }
  return found;
}

const clip = (interval: BusyInterval, window: BusyWindow): BusyInterval | null => {
  const start = interval.start < window.from ? window.from : interval.start;
  const end = interval.end > window.to ? window.to : interval.end;
  return end > start ? { start, end } : null;
};

/** Sorted, merged busy intervals inside the window. */
function merge(intervals: readonly BusyInterval[]): readonly BusyInterval[] {
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  return sorted.reduce<BusyInterval[]>((merged, interval) => {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) {
      return [...merged.slice(0, -1), { start: last.start, end: interval.end > last.end ? interval.end : last.end }];
    }
    return [...merged, interval];
  }, []);
}

/**
 * @throws CalendarParseError when the text is not an iCalendar or is far beyond any real calendar.
 */
export function parseBusy(text: string, window: BusyWindow): readonly BusyInterval[] {
  const root = parseRoot(text);
  const inWindow = eventsOf(root).flatMap((event) => occurrencesOf(event, window).flatMap((interval) => clip(interval, window) ?? []));
  return merge(inWindow).slice(0, MAX_INTERVALS);
}
