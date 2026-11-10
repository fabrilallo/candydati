import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKING_HOURS, freeSlots, suggestedSlots, workingHoursSchema, type AvailabilityPerson } from './availability.js';

// Monday 2026-11-16, 08:00 in Rome.
const now = new Date('2026-11-16T07:00:00Z');
const rome = (busy: { start: string; end: string }[] = []): AvailabilityPerson => ({
  timeZone: 'Europe/Rome',
  workingHours: DEFAULT_WORKING_HOURS,
  busy: busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) })),
});
const iso = (slots: readonly Date[]) => slots.map((slot) => slot.toISOString());
const base = { now, horizonDays: 2, minNoticeMinutes: 0, stepMinutes: 60, durationMinutes: 60 };

describe('working hours', () => {
  it('accepts days and a start before the end, refuses the rest', () => {
    expect(workingHoursSchema.safeParse({ days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }).success).toBe(true);
    expect(workingHoursSchema.safeParse({ days: [1], start: '18:00', end: '09:00' }).success).toBe(false);
    expect(workingHoursSchema.safeParse({ days: [], start: '09:00', end: '18:00' }).success).toBe(false);
    expect(workingHoursSchema.safeParse({ days: [8], start: '09:00', end: '18:00' }).success).toBe(false);
    expect(workingHoursSchema.safeParse({ days: [1, 1], start: '09:00', end: '18:00' }).success).toBe(false);
    expect(workingHoursSchema.safeParse({ days: [1], start: '9:00', end: '18:00' }).success).toBe(false);
  });
});

describe('free slots', () => {
  it('lists the times inside working hours where the whole interview fits', () => {
    const slots = iso(freeSlots({ ...base, horizonDays: 1, people: [rome()] }));
    // 09:00 … 17:00 Rome = 08:00 … 16:00 UTC; an hour starting at 17:00 still ends at 18:00.
    expect(slots[0]).toBe('2026-11-16T08:00:00.000Z');
    expect(slots.at(-1)).toBe('2026-11-16T16:00:00.000Z');
    expect(slots).toHaveLength(9);
  });

  it('leaves out what overlaps a busy time, even by a minute', () => {
    const slots = iso(freeSlots({ ...base, horizonDays: 1, people: [rome([{ start: '2026-11-16T09:30:00Z', end: '2026-11-16T10:01:00Z' }])] }));
    expect(slots).not.toContain('2026-11-16T09:00:00.000Z');
    expect(slots).not.toContain('2026-11-16T10:00:00.000Z');
    expect(slots).toContain('2026-11-16T08:00:00.000Z');
    expect(slots).toContain('2026-11-16T11:00:00.000Z');
  });

  it('keeps only the times when every interviewer is free, each in their own zone', () => {
    const london: AvailabilityPerson = { timeZone: 'Europe/London', workingHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' }, busy: [] };
    const slots = iso(freeSlots({ ...base, horizonDays: 1, people: [rome([{ start: '2026-11-16T09:00:00Z', end: '2026-11-16T10:00:00Z' }]), london] }));
    expect(slots).toEqual(['2026-11-16T10:00:00.000Z', '2026-11-16T11:00:00.000Z']);
  });

  it('respects the minimum notice, the horizon and the weekend', () => {
    const friday = new Date('2026-11-20T07:00:00Z');
    const slots = iso(freeSlots({ ...base, now: friday, horizonDays: 4, minNoticeMinutes: 24 * 60, people: [rome()] }));
    // Friday is inside the notice, Saturday and Sunday are not working days.
    expect(slots.every((slot) => slot.startsWith('2026-11-23'))).toBe(true);
    expect(slots[0]).toBe('2026-11-23T08:00:00.000Z');
  });

  it('starts on the step after now, never in the past', () => {
    const slots = iso(freeSlots({ ...base, now: new Date('2026-11-16T08:10:00Z'), stepMinutes: 30, durationMinutes: 30, horizonDays: 1, people: [rome()] }));
    expect(slots[0]).toBe('2026-11-16T08:30:00.000Z');
  });

  it('gives nothing without people', () => {
    expect(freeSlots({ ...base, people: [] })).toEqual([]);
  });
});

describe('suggested slots for the email', () => {
  it('takes the first time of different days, then fills with the next ones', () => {
    const slots = freeSlots({ ...base, horizonDays: 3, people: [rome()] });
    expect(iso(suggestedSlots(slots, 3, 'Europe/Rome'))).toEqual(['2026-11-16T08:00:00.000Z', '2026-11-17T08:00:00.000Z', '2026-11-18T08:00:00.000Z']);
    const oneDay = freeSlots({ ...base, horizonDays: 1, people: [rome()] });
    expect(iso(suggestedSlots(oneDay, 3, 'Europe/Rome'))).toEqual(['2026-11-16T08:00:00.000Z', '2026-11-16T09:00:00.000Z', '2026-11-16T10:00:00.000Z']);
    expect(suggestedSlots([], 3, 'Europe/Rome')).toEqual([]);
  });
});
