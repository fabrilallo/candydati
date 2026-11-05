import { describe, expect, it } from 'vitest';
import { growthRatio, LINEAR_GROWTH_MAX, LINEAR_TIME_TEST_TIMEOUT_MS } from './linear-time.js';

/** Keeps the loops below from being optimized away. */
let sink = 0;

/** Work proportional to the size. */
const linear = (size: number): void => {
  for (let i = 0; i < size * 100; i += 1) sink = (sink + i) % 7919;
};

/** Work proportional to the square of the size, like a regular expression that backtracks. */
const quadratic = (size: number): void => {
  for (let i = 0; i < size; i += 1) for (let j = 0; j < size; j += 1) sink = (sink + j) % 7919;
};

describe('growthRatio', () => {
  it('passes linear work with a wide margin', () => {
    expect(growthRatio(linear, 1000)).toBeLessThan(LINEAR_GROWTH_MAX);
  });

  it('fails quadratic work clearly, even when its small input is fast', () => {
    expect(growthRatio(quadratic, 100)).toBeGreaterThan(LINEAR_GROWTH_MAX * 2);
  }, LINEAR_TIME_TEST_TIMEOUT_MS);

  it('measures inputs too fast to time by growing them first', () => {
    const sizes: number[] = [];
    growthRatio((size) => sizes.push(size), 10);
    expect(Math.min(...sizes)).toBe(10);
    expect(Math.max(...sizes)).toBeGreaterThan(10 * 16);
  });
});
