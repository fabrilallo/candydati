import { describe, expect, it } from 'vitest';
import { expectLinearOnHostileInput } from '../testing/linear-time.js';
import { safeFileName } from './file-name.js';

describe('safeFileName', () => {
  it('drops trailing dots and spaces from the base name', () => {
    expect(safeFileName('cv. . ..pdf', 'application/pdf')).toBe('cv.pdf');
  });

  it('stays linear on a long run of dots and spaces that is not at the end', () => {
    const run = (size: number) => {
      safeFileName(`a${'. '.repeat(size)}b.pdf`, 'application/pdf');
    };
    expectLinearOnHostileInput(run, { size: 50_000 });
  }, 20_000);
});
