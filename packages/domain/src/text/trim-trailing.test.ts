import { describe, expect, it } from 'vitest';
import { growthRatio, LINEAR_GROWTH_MAX } from '../testing/linear-time.js';
import { trimTrailing } from './trim-trailing.js';

describe('trimTrailing', () => {
  it('drops only the listed characters, only at the end', () => {
    expect(trimTrailing('https://a.test///', '/')).toBe('https://a.test');
    expect(trimTrailing('mario-rossi).,;', '.,;)')).toBe('mario-rossi');
    expect(trimTrailing('/a/b', '/')).toBe('/a/b');
    expect(trimTrailing('///', '/')).toBe('');
    expect(trimTrailing('', '/')).toBe('');
    expect(trimTrailing('abc', '')).toBe('abc');
  });

  it('stays linear on a long run of the trimmed character followed by something else', () => {
    const hostile = `${'/'.repeat(50_000)}a`;
    expect(trimTrailing(hostile, '/')).toBe(hostile);
    expect(trimTrailing(`a${')'.repeat(50_000)}`, '.,;)')).toBe('a');
    const run = (size: number) => {
      trimTrailing(`${'/'.repeat(size)}a`, '/');
      trimTrailing(`a${')'.repeat(size)}`, '.,;)');
    };
    expect(growthRatio(run, 10_000)).toBeLessThan(LINEAR_GROWTH_MAX);
  });
});
