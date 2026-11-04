import { describe, expect, it } from 'vitest';
import { failingCases, summarizeCase, summarizeCases, summarizeOverall, type RunOutcome } from './stats.js';

const run = (caseId: string, passed: boolean, failures: readonly string[] = passed ? [] : ['x']): RunOutcome => ({ caseId, passed, failures });

describe('summarizeCase', () => {
  it('computes pass rate and a zero variance when every run agrees', () => {
    const all = summarizeCase('a', [run('a', true), run('a', true), run('a', true)]);
    expect(all).toMatchObject({ runs: 3, passes: 3, passRate: 1, variance: 0, flaky: false });
    const none = summarizeCase('a', [run('a', false), run('a', false)]);
    expect(none).toMatchObject({ passRate: 0, variance: 0, flaky: false });
  });

  it('marks a mixed case as flaky with Bernoulli variance p(1-p)', () => {
    const mixed = summarizeCase('a', [run('a', true), run('a', false), run('a', false), run('a', true)]);
    expect(mixed.passRate).toBe(0.5);
    expect(mixed.variance).toBeCloseTo(0.25);
    expect(mixed.flaky).toBe(true);
    expect(summarizeCase('a', [run('a', true), run('a', true), run('a', false)]).variance).toBeCloseTo(2 / 9);
  });

  it('counts distinct failures, most frequent first, ties alphabetical', () => {
    const summary = summarizeCase('a', [run('a', false, ['b', 'a']), run('a', false, ['b']), run('a', true)]);
    expect(summary.failureCounts).toEqual([
      ['b', 2],
      ['a', 1],
    ]);
  });

  it('does not divide by zero without runs', () => {
    expect(summarizeCase('a', [])).toMatchObject({ runs: 0, passRate: 0, variance: 0, flaky: false });
  });
});

describe('summarizeCases and summarizeOverall', () => {
  const outcomes = [run('a', true), run('b', false), run('a', true), run('b', true), run('c', false), run('c', false)];

  it('groups by case in first-appearance order', () => {
    expect(summarizeCases(outcomes).map((c) => [c.caseId, c.passes, c.runs])).toEqual([
      ['a', 2, 2],
      ['b', 1, 2],
      ['c', 0, 2],
    ]);
  });

  it('pools runs, counts stable and flaky cases, and the variance of case pass rates', () => {
    const overall = summarizeOverall(summarizeCases(outcomes));
    expect(overall).toMatchObject({ cases: 3, runs: 6, passes: 3, stablePasses: 1, flakyCases: 1 });
    expect(overall.passRate).toBe(0.5);
    expect(overall.meanCasePassRate).toBeCloseTo(0.5);
    // rates 1, 0.5, 0 around 0.5: (0.25 + 0 + 0.25) / 3
    expect(overall.passRateVariance).toBeCloseTo(1 / 6);
  });

  it('is all zeros for no cases', () => {
    expect(summarizeOverall([])).toMatchObject({ cases: 0, runs: 0, passRate: 0, passRateVariance: 0 });
  });

  it('keeps one lucky run from passing a case under a strict threshold', () => {
    const summaries = summarizeCases(outcomes);
    expect(failingCases(summaries, 1).map((c) => c.caseId)).toEqual(['b', 'c']);
    expect(failingCases(summaries, 0.5).map((c) => c.caseId)).toEqual(['c']);
  });

  it('does not mutate its input', () => {
    const copy = JSON.stringify(outcomes);
    summarizeOverall(summarizeCases(outcomes));
    expect(JSON.stringify(outcomes)).toBe(copy);
  });
});
