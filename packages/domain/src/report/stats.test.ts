import { describe, expect, it } from 'vitest';
import { durationStat, isSmallSample, median, p75, percentile, rate, REPORT_MIN_SAMPLE, roundTo } from './stats.js';

describe('percentiles', () => {
  it('returns null for an empty list', () => {
    expect(median([])).toBeNull();
    expect(p75([])).toBeNull();
  });
  it('takes the middle value, or interpolates between the two middle ones', () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });
  it('interpolates the 75th percentile like Postgres percentile_cont', () => {
    expect(p75([1, 2, 3, 4])).toBe(3.25);
    expect(p75([10, 20, 30, 40, 50])).toBe(40);
    expect(percentile([7], 0.75)).toBe(7);
  });
  it('does not reorder the input', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
  it('summarises a duration, rounded to 2 decimals', () => {
    expect(durationStat([1, 2, 4])).toEqual({ count: 3, median: 2, p75: 3 });
    expect(durationStat([1 / 3, 2 / 3])).toEqual({ count: 2, median: 0.5, p75: 0.58 });
    expect(durationStat([])).toEqual({ count: 0, median: null, p75: null });
  });
  it('rounds', () => {
    expect(roundTo(1.005 + 0.0001, 2)).toBe(1.01);
  });
});

describe('rate', () => {
  it('keeps the denominator and is null without one', () => {
    expect(rate(3, 4)).toEqual({ count: 3, total: 4, rate: 0.75 });
    expect(rate(1, 3)).toEqual({ count: 1, total: 3, rate: 0.3333 });
    expect(rate(0, 0)).toEqual({ count: 0, total: 0, rate: null });
  });
  it('flags small samples under 5', () => {
    expect(REPORT_MIN_SAMPLE).toBe(5);
    expect(isSmallSample(4)).toBe(true);
    expect(isSmallSample(5)).toBe(false);
  });
});
