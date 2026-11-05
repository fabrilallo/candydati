import { describe, expect, it } from 'vitest';
import { expectLinearOnHostileInput, hostileText } from './linear-time.js';

/**
 * A smaller size and budget keep the self-test short: 8000² = 6.4e7 steps take about 50 ms or more uninstrumented and over a
 * second under coverage on a CI runner, always far above 20 ms. The timeout covers the slow instrumented run.
 */
const SMALL = { size: 8_000, budgetMs: 20 };
const SELF_TEST_TIMEOUT_MS = 30_000;

const quadratic = (size: number): number => {
  let steps = 0;
  for (let i = 0; i < size; i += 1) for (let j = 0; j < size; j += 1) steps += (i ^ j) & 1;
  return steps;
};

describe('expectLinearOnHostileInput', () => {
  it('passes linear code', () => {
    expect(() => expectLinearOnHostileInput((size) => { hostileText('a', size).replace(/a+$/, ''); })).not.toThrow();
    expect(() => expectLinearOnHostileInput((size) => { hostileText('a', size).split('').reverse().join(''); })).not.toThrow();
  });

  it('fails a quadratic function, stating size, time and budget', () => {
    expect(() => expectLinearOnHostileInput(quadratic, SMALL)).toThrow(/size 8000 took \d+ ms, budget 20 ms/);
  }, SELF_TEST_TIMEOUT_MS);

  it('builds hostile text by total length', () => {
    expect(hostileText('ab', 5)).toHaveLength(6);
    expect(hostileText('x', 10)).toBe('x'.repeat(10));
  });
});
