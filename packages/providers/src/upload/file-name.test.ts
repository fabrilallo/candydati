import { describe, expect, it } from 'vitest';
import { growthRatio, LINEAR_GROWTH_MAX } from '../testing/linear-time.js';
import { safeFileName } from './file-name.js';

describe('safeFileName', () => {
  it('drops trailing dots and spaces from the base name', () => {
    expect(safeFileName('cv. . ..pdf', 'application/pdf')).toBe('cv.pdf');
  });

  it('stays linear on a long run of dots and spaces that is not at the end', () => {
    const run = (size: number) => {
      safeFileName(`a${'. '.repeat(size)}b.pdf`, 'application/pdf');
    };
    expect(growthRatio(run, 10_000)).toBeLessThan(LINEAR_GROWTH_MAX);
  });
});
