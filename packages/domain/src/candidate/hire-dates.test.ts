import { describe, expect, it } from 'vitest';
import { checkHireDates, daysBetweenDates, hireDatesSchema, utcDay } from './hire-dates.js';

const applied = new Date('2026-03-10T15:30:00Z');

describe('hireDatesSchema', () => {
  it('accepts date-only values, both optional and nullable', () => {
    expect(hireDatesSchema.parse({})).toEqual({});
    expect(hireDatesSchema.parse({ offerAcceptedOn: '2026-04-01', startOn: null })).toEqual({ offerAcceptedOn: '2026-04-01', startOn: null });
  });

  it.each(['2026-4-1', '2026-02-30', '2026-04-01T10:00:00Z', 'tomorrow', '1999-12-31', '2101-01-01'])('rejects %s', (value) => {
    expect(hireDatesSchema.safeParse({ offerAcceptedOn: value }).success).toBe(false);
  });
});

describe('utcDay', () => {
  it('cuts a timestamp to its UTC day', () => {
    expect(utcDay(applied)).toBe('2026-03-10');
  });
});

describe('checkHireDates', () => {
  it('accepts the same day as the application, and a start the same day as the offer', () => {
    expect(checkHireDates(applied, { offerAcceptedOn: '2026-03-10', startOn: '2026-03-10' })).toBeNull();
  });

  it('accepts no dates at all', () => {
    expect(checkHireDates(applied, { offerAcceptedOn: null, startOn: null })).toBeNull();
  });

  it('refuses an offer before the application date', () => {
    expect(checkHireDates(applied, { offerAcceptedOn: '2026-03-09', startOn: null })).toBe('offer_before_application');
  });

  it('refuses a start before the offer', () => {
    expect(checkHireDates(applied, { offerAcceptedOn: '2026-04-10', startOn: '2026-04-09' })).toBe('start_before_offer');
  });

  it('refuses a start before the application date when there is no offer date', () => {
    expect(checkHireDates(applied, { offerAcceptedOn: null, startOn: '2026-03-01' })).toBe('start_before_application');
  });
});

describe('daysBetweenDates', () => {
  it('counts whole days from the application day', () => {
    expect(daysBetweenDates(applied, '2026-03-20')).toBe(10);
    expect(daysBetweenDates(applied, '2026-03-10')).toBe(0);
  });
});
