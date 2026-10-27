import { describe, expect, it } from 'vitest';
import {
  adQualityReportSchema,
  type AdQualityReport,
  assess,
  DEFAULT_AD_QUALITY_THRESHOLD,
  isBelowQualityThreshold,
  shownQualityReport,
  QUALITY_CATEGORIES,
  QUALITY_MAX_TOTAL,
  totalOf,
} from './quality.js';

const uniform = (value: number): AdQualityReport['scores'] =>
  Object.fromEntries(QUALITY_CATEGORIES.map((category) => [category, value])) as AdQualityReport['scores'];

const report = (total: number): AdQualityReport => ({
  scores: uniform(total / QUALITY_MAX_TOTAL),
  total,
  vaguePhrases: [],
  improvements: [],
  source: 'rules',
});

describe('totalOf', () => {
  it('sums the ten category scores', () => {
    expect(totalOf(uniform(0.5))).toBe(5);
    expect(totalOf(uniform(1))).toBe(QUALITY_MAX_TOTAL);
    expect(totalOf(uniform(0))).toBe(0);
  });

  it('rounds to one decimal', () => {
    const scores = { ...uniform(0), culture: 0.33, benefits: 0.33, growth: 0.33 };
    expect(totalOf(scores)).toBe(1);
  });
});

describe('isBelowQualityThreshold', () => {
  it('flags an ad strictly below the threshold', () => {
    expect(isBelowQualityThreshold(report(5.9), 6)).toBe(true);
  });

  it('does not flag an ad exactly at the threshold', () => {
    expect(isBelowQualityThreshold(report(6), 6)).toBe(false);
  });

  it('does not flag an ad above the threshold', () => {
    expect(isBelowQualityThreshold(report(8), 6)).toBe(false);
  });

  it('uses 6 as the default threshold', () => {
    expect(DEFAULT_AD_QUALITY_THRESHOLD).toBe(6);
  });
});

describe('assess', () => {
  it('returns the report, the threshold and the flag', () => {
    const below = assess(report(4), 6);
    expect(below).toEqual({ report: report(4), threshold: 6, belowThreshold: true });
    expect(assess(report(6), 6).belowThreshold).toBe(false);
  });
});

describe('adQualityReportSchema', () => {
  const valid = { ...report(5), scores: uniform(0.5) };

  it('accepts a complete report', () => {
    expect(adQualityReportSchema.safeParse(valid).success).toBe(true);
  });

  it.each([1.2, -0.1])('rejects a category score of %s', (score) => {
    expect(adQualityReportSchema.safeParse({ ...valid, scores: { ...uniform(0.5), culture: score } }).success).toBe(false);
  });

  it('rejects a missing category', () => {
    const { culture: _culture, ...partial } = uniform(0.5);
    expect(adQualityReportSchema.safeParse({ ...valid, scores: partial }).success).toBe(false);
  });

  it('rejects a total above the maximum', () => {
    expect(adQualityReportSchema.safeParse({ ...valid, total: QUALITY_MAX_TOTAL + 1 }).success).toBe(false);
  });

  it('rejects an unknown source', () => {
    expect(adQualityReportSchema.safeParse({ ...valid, source: 'oracle' }).success).toBe(false);
  });
});

describe('shownQualityReport', () => {
  const byModel: AdQualityReport = { ...report(7), source: 'model' };

  it('shows a report a model produced while a model is configured', () => {
    expect(shownQualityReport(byModel, true)).toBe(byModel);
  });

  it('shows nothing while no model is configured, whatever is stored', () => {
    expect(shownQualityReport(byModel, false)).toBeNull();
  });

  it('never shows a report the rules produced alone', () => {
    expect(shownQualityReport(report(7), true)).toBeNull();
  });

  it('shows nothing without a stored report', () => {
    expect(shownQualityReport(null, true)).toBeNull();
  });
});
