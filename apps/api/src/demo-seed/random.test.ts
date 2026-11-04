import { describe, expect, it } from 'vitest';
import { seededRandom, shuffled } from './random.js';

describe('seededRandom', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('stays in [0, 1)', () => {
    const next = seededRandom(1);
    const values = Array.from({ length: 200 }, () => next());
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

describe('shuffled', () => {
  it('returns a new permutation and leaves the input untouched', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6]);
    const output = shuffled(input, seededRandom(3));
    expect([...output].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect(output).toEqual(shuffled(input, seededRandom(3)));
  });
});
