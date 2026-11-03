import { describe, expect, it } from 'vitest';
import { growthRatio, LINEAR_GROWTH_MAX } from '../testing/linear-time.js';
import { packageFileName } from './package-builder.js';

describe('packageFileName', () => {
  it('drops trailing dots and spaces', () => {
    expect(packageFileName('dir/cv final. . ')).toBe('cv final');
  });

  it('stays linear on a long run of dots and spaces that is not at the end', () => {
    const run = (size: number) => {
      packageFileName(`a${'. '.repeat(size)}b`);
    };
    expect(growthRatio(run, 10_000)).toBeLessThan(LINEAR_GROWTH_MAX);
  });
});
