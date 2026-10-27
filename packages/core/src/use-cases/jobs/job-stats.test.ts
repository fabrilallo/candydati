import type { JobContent } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { buildJob, completeJobContent, fixedQualityReport } from '../../testing/index.js';
import { buildProcess, buildQuality, buildReadiness, buildSalary, buildStatusCounts, median } from './job-stats.js';

const withoutKey = (content: JobContent, key: keyof JobContent): JobContent =>
  Object.fromEntries(Object.entries(content).filter(([k]) => k !== key)) as JobContent;

const published = (id: string, overrides: Partial<Parameters<typeof completeJobContent>[0]> = {}) =>
  buildJob({ id, status: 'published', content: completeJobContent({ title: id, ...overrides }) });

describe('median', () => {
  it('takes the middle value, or the mean of the two middle ones', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('buildStatusCounts', () => {
  it('adds the total', () => {
    expect(buildStatusCounts({ draft: 2, published: 3, closed: 1 })).toEqual({ draft: 2, published: 3, closed: 1, total: 6 });
  });
});

describe('buildQuality', () => {
  it('keeps scored ads lowest first, flags those below the threshold and averages to one decimal', () => {
    const jobs = [
      { ...published('a'), quality: fixedQualityReport(8) },
      { ...published('b'), quality: fixedQualityReport(5.5) },
      published('unscored'),
      { ...published('c'), quality: fixedQualityReport(6) },
    ];
    expect(buildQuality(jobs, 6, true)).toEqual({
      available: true,
      threshold: 6,
      items: [
        { id: 'b', title: 'b', total: 5.5, belowThreshold: true },
        { id: 'c', title: 'c', total: 6, belowThreshold: false },
        { id: 'a', title: 'a', total: 8, belowThreshold: false },
      ],
      average: 6.5,
      belowCount: 1,
    });
  });

  it('has a null average when nothing is scored', () => {
    expect(buildQuality([published('x')], 6, true)).toEqual({ available: true, threshold: 6, items: [], average: null, belowCount: 0 });
  });

  it('leaves out the scores the rules produced alone', () => {
    const jobs = [{ ...published('a'), quality: fixedQualityReport(3, 'rules') }, { ...published('b'), quality: fixedQualityReport(7) }];
    expect(buildQuality(jobs, 6, true).items.map((item) => item.id)).toEqual(['b']);
  });

  it('has no score at all while no model is configured', () => {
    const jobs = [{ ...published('a'), quality: fixedQualityReport(3) }];
    expect(buildQuality(jobs, 6, false)).toEqual({ available: false, threshold: 6, items: [], average: null, belowCount: 0 });
  });
});

describe('buildSalary', () => {
  const salary = (min: number, max: number, currency: 'EUR' | 'USD' = 'EUR', period: 'year' | 'month' = 'year') => ({
    salary: { min, max, currency, period },
  });

  it('carries the text of a custom role and sorts by it', () => {
    const { items } = buildSalary([
      published('z', { title: 'z', role: 'other', customRole: 'Pastry chef', ...salary(30000, 40000) }),
      published('a', { title: 'a', role: 'backend_developer', ...salary(30000, 40000) }),
    ]);
    expect(items.map((item) => item.id)).toEqual(['a', 'z']);
    expect(items[1]).toMatchObject({ role: 'other', customRole: 'Pastry chef' });
    expect(items[0]).not.toHaveProperty('customRole');
  });

  it('lists published content by role then minimum, and skips content that is not publishable', () => {
    const jobs = [
      published('fe', { title: 'fe', role: 'frontend_developer', ...salary(30000, 40000) }),
      published('be2', { title: 'be2', role: 'backend_developer', ...salary(50000, 60000) }),
      published('be1', { title: 'be1', role: 'backend_developer', ...salary(40000, 50000) }),
      buildJob({ id: 'broken', status: 'published', content: withoutKey(completeJobContent({ title: 'broken' }), 'role') }),
    ];
    const { items } = buildSalary(jobs);
    expect(items.map((i) => i.id)).toEqual(['be1', 'be2', 'fe']);
    expect(items[0]).toEqual({ id: 'be1', title: 'be1', role: 'backend_developer', min: 40000, max: 50000, currency: 'EUR', period: 'year' });
  });

  it('computes medians per currency and period, most ads first, ties by currency then period', () => {
    const jobs = [
      published('a', { title: 'a', ...salary(30000, 40000) }),
      published('b', { title: 'b', ...salary(40000, 50000) }),
      published('c', { title: 'c', ...salary(50000, 70000) }),
      published('d', { title: 'd', ...salary(3000, 4000, 'USD', 'month') }),
      published('e', { title: 'e', ...salary(2000, 3000, 'EUR', 'month') }),
    ];
    expect(buildSalary(jobs).medians).toEqual([
      { currency: 'EUR', period: 'year', count: 3, medianMin: 40000, medianMax: 50000 },
      { currency: 'EUR', period: 'month', count: 1, medianMin: 2000, medianMax: 3000 },
      { currency: 'USD', period: 'month', count: 1, medianMin: 3000, medianMax: 4000 },
    ]);
  });

  it('is empty without published ads', () => {
    expect(buildSalary([])).toEqual({ items: [], medians: [] });
  });
});

describe('buildProcess', () => {
  it('averages stages, total minutes and response days over published content', () => {
    const stage = (durationMinutes: number) => ({ type: 'hr_interview' as const, durationMinutes, conductedBy: 'recruiter' as const });
    const jobs = [
      published('a', { title: 'a', process: [stage(30), stage(60)], responseDays: 5 }),
      published('b', { title: 'b', process: [stage(45), stage(45), stage(15)], responseDays: 2 }),
      published('c', { title: 'c', process: [stage(20), stage(21)], responseDays: 3 }),
    ];
    expect(buildProcess(jobs)).toEqual({ jobCount: 3, averageStages: 2.3, averageProcessMinutes: 79, averageResponseDays: 3.3 });
  });

  it('is null without published ads', () => {
    expect(buildProcess([])).toEqual({ jobCount: 0, averageStages: null, averageProcessMinutes: null, averageResponseDays: null });
  });
});

describe('buildReadiness', () => {
  it('counts ready drafts and blockers per rule and path, most frequent first then by path', () => {
    const drafts = [
      buildJob({ id: 'ready' }),
      buildJob({ id: 'd1', content: withoutKey(completeJobContent({ title: 'd1', salary: { min: 50000, max: 40000 } }), 'role') }),
      buildJob({ id: 'd2', content: withoutKey(withoutKey(completeJobContent({ title: 'd2' }), 'role'), 'responseDays') }),
    ];
    expect(buildReadiness(drafts)).toEqual({
      draftCount: 3,
      readyCount: 1,
      blockers: [
        { rule: 'required', path: 'role', drafts: 2 },
        { rule: 'required', path: 'responseDays', drafts: 1 },
        { rule: 'salary_max_below_min', path: 'salary.max', drafts: 1 },
      ],
    });
  });

  it('is empty without drafts', () => {
    expect(buildReadiness([])).toEqual({ draftCount: 0, readyCount: 0, blockers: [] });
  });
});
