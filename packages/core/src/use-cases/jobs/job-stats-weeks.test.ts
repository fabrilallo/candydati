import { describe, expect, it } from 'vitest';
import { bucketByWeek, fillWeeks, weekStartOf, weekStarts } from './job-stats-weeks.js';

describe('weekStartOf', () => {
  it('maps any instant to the Monday (UTC) that opens its week', () => {
    expect(weekStartOf(new Date('2026-06-01T00:00:00.000Z'))).toBe('2026-06-01'); // Monday
    expect(weekStartOf(new Date('2026-06-03T12:00:00.000Z'))).toBe('2026-06-01');
    expect(weekStartOf(new Date('2026-06-07T23:59:59.999Z'))).toBe('2026-06-01'); // Sunday
    expect(weekStartOf(new Date('2026-06-08T00:00:00.000Z'))).toBe('2026-06-08');
  });

  it('ignores the local offset of the instant', () => {
    expect(weekStartOf(new Date('2026-06-08T01:00:00+02:00'))).toBe('2026-06-01');
  });

  it('crosses month and year boundaries', () => {
    expect(weekStartOf(new Date('2026-01-01T10:00:00.000Z'))).toBe('2025-12-29');
  });
});

describe('weekStarts', () => {
  it('lists the requested weeks oldest first, ending with the current one', () => {
    expect(weekStarts(new Date('2026-06-03T10:00:00.000Z'), 3)).toEqual(['2026-05-18', '2026-05-25', '2026-06-01']);
  });
});

describe('bucketByWeek', () => {
  it('counts dates per week, oldest first, skipping nulls and dates before since', () => {
    const since = new Date('2026-05-25T00:00:00.000Z');
    const dates = [
      new Date('2026-06-07T23:59:00.000Z'),
      new Date('2026-06-08T00:00:00.000Z'),
      new Date('2026-06-01T08:00:00.000Z'),
      new Date('2026-05-24T23:59:59.999Z'),
      null,
    ];
    expect(bucketByWeek(dates, since)).toEqual([
      { week: '2026-06-01', count: 2 },
      { week: '2026-06-08', count: 1 },
    ]);
  });
});

describe('fillWeeks', () => {
  it('zero-fills missing weeks and ignores weeks outside the range', () => {
    const filled = fillWeeks(['2026-05-25', '2026-06-01'], {
      created: [{ week: '2026-06-01', count: 2 }, { week: '2026-06-08', count: 9 }],
      published: [{ week: '2026-05-25', count: 1 }],
    });
    expect(filled).toEqual([
      { weekStart: '2026-05-25', created: 0, published: 1 },
      { weekStart: '2026-06-01', created: 2, published: 0 },
    ]);
  });
});
