/** Time zone arithmetic on Intl only: the wall time of a person in their zone ↔ an instant. */

export interface LocalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface ZonedParts extends LocalDate {
  /** 1 = Monday … 7 = Sunday (ISO). */
  readonly weekday: number;
  /** Minutes since local midnight. */
  readonly minutes: number;
}

const WEEKDAYS: Readonly<Record<string, number>> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  formatters.set(timeZone, created);
  return created;
}

function partsOf(instant: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(formatterFor(timeZone).formatToParts(instant).map((part) => [part.type, part.value]));
}

/** True when the runtime knows the IANA zone. */
export function isTimeZone(value: string): boolean {
  try {
    formatterFor(value);
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsOf(instant, timeZone);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS[parts.weekday ?? ''] ?? 1,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Offset of the zone from UTC at that instant, in minutes (Rome in summer: 120). */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = partsOf(instant, timeZone);
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const whole = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((asUtc - whole) / 60_000);
}

/** The instant at which the clock in the zone shows that date and minute of the day (DST-safe for working hours). */
export function wallTimeToInstant(date: LocalDate, minutesOfDay: number, timeZone: string): Date {
  const guess = Date.UTC(date.year, date.month - 1, date.day, 0, minutesOfDay);
  const first = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  const second = guess - offsetMinutes(new Date(first), timeZone) * 60_000;
  return new Date(second);
}

/** The local date after adding whole days (calendar arithmetic, no time zone involved). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}
