import { describe, expect, it } from 'vitest';
import { offsetMinutes, wallTimeToInstant, zonedParts } from './time-zone.js';

describe('time zones without a library', () => {
  it('reads the offset of Europe/Rome in winter and in summer', () => {
    expect(offsetMinutes(new Date('2026-01-15T12:00:00Z'), 'Europe/Rome')).toBe(60);
    expect(offsetMinutes(new Date('2026-07-15T12:00:00Z'), 'Europe/Rome')).toBe(120);
    expect(offsetMinutes(new Date('2026-07-15T12:00:00Z'), 'America/New_York')).toBe(-240);
    expect(offsetMinutes(new Date('2026-07-15T12:00:00Z'), 'Asia/Kolkata')).toBe(330);
  });

  it('turns a wall time into the instant, on both sides of a daylight saving change', () => {
    // Italy moves to summer time on 2026-03-29 and back on 2026-10-25.
    expect(wallTimeToInstant({ year: 2026, month: 3, day: 28 }, 9 * 60, 'Europe/Rome').toISOString()).toBe('2026-03-28T08:00:00.000Z');
    expect(wallTimeToInstant({ year: 2026, month: 3, day: 30 }, 9 * 60, 'Europe/Rome').toISOString()).toBe('2026-03-30T07:00:00.000Z');
    expect(wallTimeToInstant({ year: 2026, month: 10, day: 26 }, 9 * 60, 'Europe/Rome').toISOString()).toBe('2026-10-26T08:00:00.000Z');
    expect(wallTimeToInstant({ year: 2026, month: 7, day: 1 }, 18 * 60 + 30, 'America/New_York').toISOString()).toBe('2026-07-01T22:30:00.000Z');
  });

  it('gives the local date, weekday (1 = Monday) and minutes of the day of an instant', () => {
    expect(zonedParts(new Date('2026-11-10T23:30:00Z'), 'Europe/Rome')).toEqual({ year: 2026, month: 11, day: 11, weekday: 3, minutes: 30 });
    expect(zonedParts(new Date('2026-11-15T10:15:00Z'), 'UTC')).toEqual({ year: 2026, month: 11, day: 15, weekday: 7, minutes: 615 });
  });
});
