import { z } from 'zod';
import { zonedParts } from './time-zone.js';

/**
 * Free times for an interview: inside everyone's working hours and outside everyone's busy times. The order is time
 * only; nothing here looks at a candidate.
 */

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutesOf = (clock: string): number => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

export const workingHoursSchema = z
  .object({
    /** ISO weekdays, 1 = Monday … 7 = Sunday. */
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine((days) => new Set(days).size === days.length, 'duplicate_day'),
    start: z.string().regex(CLOCK),
    end: z.string().regex(CLOCK),
  })
  .refine((hours) => minutesOf(hours.start) < minutesOf(hours.end), { path: ['end'], message: 'end_before_start' });
export type WorkingHours = z.infer<typeof workingHoursSchema>;

export const DEFAULT_WORKING_HOURS: WorkingHours = { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' };

export interface BusyInterval {
  readonly start: Date;
  readonly end: Date;
}

export interface AvailabilityPerson {
  readonly timeZone: string;
  readonly workingHours: WorkingHours;
  readonly busy: readonly BusyInterval[];
}

export interface FreeSlotsInput {
  readonly now: Date;
  readonly horizonDays: number;
  readonly minNoticeMinutes: number;
  readonly stepMinutes: number;
  readonly durationMinutes: number;
  readonly people: readonly AvailabilityPerson[];
}

const MINUTE = 60_000;

function insideWorkingHours(person: AvailabilityPerson, start: Date, end: Date): boolean {
  const from = zonedParts(start, person.timeZone);
  // The last minute of the interview, so an interview ending at 18:00 stays on the same local day.
  const to = zonedParts(new Date(end.getTime() - MINUTE), person.timeZone);
  if (from.year !== to.year || from.month !== to.month || from.day !== to.day) return false;
  if (!person.workingHours.days.includes(from.weekday)) return false;
  return from.minutes >= minutesOf(person.workingHours.start) && to.minutes + 1 <= minutesOf(person.workingHours.end);
}

const overlaps = (busy: readonly BusyInterval[], start: Date, end: Date): boolean =>
  busy.some((interval) => interval.start.getTime() < end.getTime() && interval.end.getTime() > start.getTime());

const isFreeFor = (person: AvailabilityPerson, start: Date, end: Date): boolean =>
  insideWorkingHours(person, start, end) && !overlaps(person.busy, start, end);

/** Start times, ascending, aligned to the step (UTC), from now + notice to now + horizon. */
export function freeSlots(input: FreeSlotsInput): readonly Date[] {
  if (input.people.length === 0) return [];
  const step = input.stepMinutes * MINUTE;
  const earliest = input.now.getTime() + input.minNoticeMinutes * MINUTE;
  const latest = input.now.getTime() + input.horizonDays * 24 * 60 * MINUTE;
  const slots: Date[] = [];
  for (let at = Math.ceil(earliest / step) * step; at < latest; at += step) {
    const start = new Date(at);
    const end = new Date(at + input.durationMinutes * MINUTE);
    if (input.people.every((person) => isFreeFor(person, start, end))) slots.push(start);
  }
  return slots;
}

/** True when that start time is still free (the check made again at booking). */
export function isSlotFree(input: FreeSlotsInput, slot: Date): boolean {
  return freeSlots(input).some((free) => free.getTime() === slot.getTime());
}

const dayKey = (slot: Date, timeZone: string): string => {
  const parts = zonedParts(slot, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

/** A few times for the email: the first of different days, then the next ones when there are fewer days. */
export function suggestedSlots(slots: readonly Date[], count: number, timeZone: string): readonly Date[] {
  const seenDays = new Set<string>();
  const firstOfDays = slots.filter((slot) => {
    const key = dayKey(slot, timeZone);
    if (seenDays.has(key)) return false;
    seenDays.add(key);
    return true;
  });
  const picked = firstOfDays.slice(0, count);
  const rest = slots.filter((slot) => !picked.includes(slot));
  return [...picked, ...rest.slice(0, count - picked.length)].sort((a, b) => a.getTime() - b.getTime());
}
