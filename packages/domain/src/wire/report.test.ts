import { describe, expect, it } from 'vitest';
import { REPORT_MIN_SAMPLE } from '../report/stats.js';
import { reportsSchema } from './report.js';

const stat = { count: 0, median: null, p75: null };
const rate = { count: 0, total: 0, rate: null };
const outcomes = { hired: 0, not_selected: 0, withdrawn: 0 };
const valid = {
  minSample: 7,
  timeToHire: { overall: stat, byJob: [] },
  timeToFill: { overall: stat, items: [] },
  funnel: { stages: [], outcomes, outcomesByJob: [] },
  sources: [],
  campaigns: [],
  responses: { closed: rate, kept: 0, missed: 0, responseHours: stat, open: 0, overdue: 0, byJob: [], byStageType: [] },
  outcomeCoverage: rate,
};

describe('reports wire', () => {
  it('keeps every valid section', () => {
    const parsed = reportsSchema.parse(valid);
    expect(parsed.invalid).toEqual([]);
    expect(parsed.minSample).toBe(7);
    expect(parsed.sources).toEqual([]);
  });

  it('nulls only the broken section and names it', () => {
    const parsed = reportsSchema.parse({ ...valid, sources: [{ origin: 'x' }], minSample: 'many' });
    expect(parsed.sources).toBeNull();
    expect(parsed.invalid).toEqual(['sources']);
    expect(parsed.funnel).not.toBeNull();
    expect(parsed.minSample).toBe(REPORT_MIN_SAMPLE);
  });

  it('requires visits and a campaign label on the rows', () => {
    const row = { origin: 'linkedin', applications: 2, hires: 1, visits: 10, conversion: 0.2 };
    const parsed = reportsSchema.parse({ ...valid, sources: [row], campaigns: [{ ...row, campaign: 'autumn' }] });
    expect(parsed.invalid).toEqual([]);
    expect(reportsSchema.parse({ ...valid, campaigns: [row] }).campaigns).toBeNull();
    expect(reportsSchema.parse({ ...valid, sources: [{ origin: 'x', applications: 1, hires: 0 }] }).sources).toBeNull();
  });

  it('refuses an answer that is not an object', () => {
    expect(reportsSchema.safeParse(null).success).toBe(false);
  });
});
