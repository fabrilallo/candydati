import { describe, expect, it } from 'vitest';
import { expectLinearOnHostileInput, hostileText } from './linear-time.js';

/** Small sizes and a small budget keep the self-test fast: the bad cases still run several times over it. */
const SMALL = { size: 10_000, budgetMs: 20 };

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
    expect(() => expectLinearOnHostileInput(quadratic, SMALL)).toThrow(/size 10000 took \d+ ms, budget 20 ms/);
  });

  it('fails a backtracking regex', () => {
    // 25 characters is already exponential for (a+)+b: hundreds of ms, while the budget here is 20 ms.
    expect(() => expectLinearOnHostileInput((size) => /^(a+)+b/.test('a'.repeat(size)), { size: 25, budgetMs: 20 })).toThrow(/not linear/);
  });

  it('builds hostile text by total length', () => {
    expect(hostileText('ab', 5)).toHaveLength(6);
    expect(hostileText('x', 10)).toBe('x'.repeat(10));
  });
});
