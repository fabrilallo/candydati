import { describe, expect, it } from 'vitest';
import { DEFAULT_RUNS, parseEvalConfig } from './eval-config.js';

describe('parseEvalConfig', () => {
  it('defaults to 3 runs, a strict threshold and every case', () => {
    expect(parseEvalConfig([], {})).toEqual({ runs: DEFAULT_RUNS, minPassRate: 1, caseIds: [], reportPath: null });
    expect(DEFAULT_RUNS).toBe(3);
  });

  it('reads the environment, and --runs wins over EVAL_RUNS', () => {
    expect(parseEvalConfig([], { EVAL_RUNS: '5', EVAL_MIN_PASS_RATE: '0.8', EVAL_REPORT_PATH: '/tmp/r.md' })).toEqual({ runs: 5, minPassRate: 0.8, caseIds: [], reportPath: '/tmp/r.md' });
    expect(parseEvalConfig(['--runs=2'], { EVAL_RUNS: '5' }).runs).toBe(2);
  });

  it('treats empty variables (an unset workflow input) as absent', () => {
    expect(parseEvalConfig([], { EVAL_RUNS: '', EVAL_MIN_PASS_RATE: ' ' })).toMatchObject({ runs: 3, minPassRate: 1 });
  });

  it('takes the other arguments as case ids', () => {
    expect(parseEvalConfig(['rank-it', '--runs=1', 'best-it'], {}).caseIds).toEqual(['rank-it', 'best-it']);
  });

  it.each([['0'], ['21'], ['1.5'], ['abc']])('rejects EVAL_RUNS=%s', (runs) => {
    expect(() => parseEvalConfig([], { EVAL_RUNS: runs })).toThrow();
  });

  it('rejects a threshold outside 0..1', () => {
    expect(() => parseEvalConfig([], { EVAL_MIN_PASS_RATE: '1.2' })).toThrow();
  });
});
