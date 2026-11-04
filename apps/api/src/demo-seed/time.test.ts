import { describe, expect, it } from 'vitest';
import { daysAfter, daysBefore, isoDay } from './time.js';

const NOW = new Date('2026-11-04T10:00:00.000Z');

describe('time helpers', () => {
  it('moves by whole and fractional days without touching the input', () => {
    expect(daysBefore(NOW, 2).toISOString()).toBe('2026-11-02T10:00:00.000Z');
    expect(daysAfter(NOW, 0.5).toISOString()).toBe('2026-11-04T22:00:00.000Z');
    expect(NOW.toISOString()).toBe('2026-11-04T10:00:00.000Z');
  });

  it('formats the calendar day', () => {
    expect(isoDay(NOW)).toBe('2026-11-04');
  });
});
