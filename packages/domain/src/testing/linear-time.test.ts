import { describe, expect, it } from 'vitest';
import { clockResolution, growthRatio, LINEAR_GROWTH_MAX, LINEAR_TIME_TEST_TIMEOUT_MS, type Clock } from './linear-time.js';

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

/** A clock that only moves in steps of `stepMs`, like CPU time read from the scheduler tick on Linux. */
const coarseClock = (stepMs: number): Clock => ({ now: () => Math.floor(performance.now() / stepMs) * stepMs });
const frozenClock: Clock = { now: () => 0 };

describe('growthRatio', () => {
  it('passes linear work with a wide margin', () => {
    expect(growthRatio(linear, 1000)).toBeLessThan(LINEAR_GROWTH_MAX);
  });

  it('fails quadratic work clearly, even when its small input is fast', () => {
    expect(growthRatio(quadratic, 100)).toBeGreaterThan(LINEAR_GROWTH_MAX * 2);
  }, LINEAR_TIME_TEST_TIMEOUT_MS);

  it('measures fast work on a coarse clock by repeating it, and still separates linear from quadratic', () => {
    const clock = coarseClock(0.2);
    expect(growthRatio((size) => linear(size), 10, clock)).toBeLessThan(LINEAR_GROWTH_MAX);
    expect(growthRatio(quadratic, 20, clock)).toBeGreaterThan(LINEAR_GROWTH_MAX * 2);
  }, LINEAR_TIME_TEST_TIMEOUT_MS);

  it('measures again with more repetitions when the work got faster after calibration, as JIT-compiled code does', () => {
    let calls = 0;
    const warmsUp = (size: number): void => {
      calls += 1;
      linear(calls <= 40 ? size * 50 : size);
    };
    expect(growthRatio(warmsUp, 10, coarseClock(0.2))).toBeLessThan(LINEAR_GROWTH_MAX);
  }, LINEAR_TIME_TEST_TIMEOUT_MS);

  it('grows a fast input before timing it', () => {
    const sizes: number[] = [];
    growthRatio((size) => {
      sizes.push(size);
      linear(size);
    }, 10);
    expect(Math.min(...sizes)).toBe(10);
    expect(Math.max(...sizes)).toBeGreaterThan(10 * 16);
  });

  it('refuses a clock that does not move, instead of dividing by zero', () => {
    expect(() => growthRatio(linear, 10, frozenClock)).toThrow(/clock/);
  });
});

describe('clockResolution', () => {
  it('reads the step of a coarse clock and finds none on a frozen one', () => {
    // At least the step; a probe preempted past a tick may see two steps at once, never less than one.
    expect(clockResolution(coarseClock(2))).toBeGreaterThanOrEqual(2 - 1e-9);
    expect(clockResolution(coarseClock(2))).toBeLessThan(10);
    expect(clockResolution(frozenClock)).toBe(Number.POSITIVE_INFINITY);
  });
});
