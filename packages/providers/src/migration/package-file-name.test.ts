import { describe, expect, it } from 'vitest';
import { expectLinearOnHostileInput } from '../testing/linear-time.js';
import { packageFileName } from './package-builder.js';

describe('packageFileName', () => {
  it('drops trailing dots and spaces', () => {
    expect(packageFileName('dir/cv final. . ')).toBe('cv final');
  });

  it('stays linear on a long run of dots and spaces that is not at the end', () => {
    const run = (size: number) => {
      packageFileName(`a${'. '.repeat(size)}b`);
    };
    expectLinearOnHostileInput(run, { size: 50_000 });
  }, 20_000);
});
