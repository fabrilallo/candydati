import { describe, expect, it } from 'vitest';
import type { EvalCase } from './cases.js';
import { markdownCell, renderReport, type CaseResult } from './report.js';

describe('markdownCell', () => {
  it('flattens whitespace and escapes pipes so a cell stays one cell', () => {
    expect(markdownCell('a\n  b | c')).toBe('a b \\| c');
  });

  it('escapes backslashes first, so an answer ending in \\ cannot escape the next pipe', () => {
    expect(markdownCell('C:\\path\\')).toBe('C:\\\\path\\\\');
    expect(markdownCell('a \\| b')).toBe('a \\\\\\| b');
  });

  it('cuts long text before escaping, so no escape is split in half', () => {
    expect(markdownCell(`${'x'.repeat(159)}\\|`)).toBe(`${'x'.repeat(159)}\\\\…`);
    expect(markdownCell('short', 3)).toBe('sho…');
  });
});

describe('renderReport', () => {
  const evalCase = (id: string): EvalCase => ({ id, prompt: 'p', expectRefusal: false });
  const result = (id: string, passed: boolean, failures: readonly string[] = []): CaseResult => ({
    evalCase: evalCase(id),
    answer: 'risposta | con pipe',
    toolCalls: ['get_job({"jobId":"j"})'],
    errors: [],
    effects: [],
    verdict: null,
    failures,
    passed,
  });
  const report = renderReport({
    agentModel: 'a/m',
    judgeModel: 'j/m',
    runsPerCase: 3,
    date: new Date('2026-11-04T10:30:00Z'),
    results: [result('stable', true), result('stable', true), result('stable', true), result('flaky', true), result('flaky', false, ['check: tool x']), result('flaky', false, ['check: tool x'])],
  });

  it('states the repeats, the pooled pass rate and the variance', () => {
    expect(report).toContain('2 cases, each run 3 times (6 runs)');
    expect(report).toContain('**Overall pass rate 67% (4/6 runs).** 1/2 cases passed in every run, 1 flaky.');
    expect(report).toContain('variance of the per-case pass rates 0.111');
    expect(report).toContain('2026-11-04 10:30 UTC');
  });

  it('shows pass rate and variance per case, flaky ones in bold, with counted failures', () => {
    expect(report).toContain('| stable | 100% (3/3) | 0.00 |');
    expect(report).toContain('| flaky | **33% (1/3)** | 0.22 |');
    expect(report).toContain('2x check: tool x');
  });

  it('keeps a pipe in an answer from splitting the cell', () => {
    expect(report).toContain('risposta \\| con pipe');
  });
});
