import { describe, expect, it } from 'vitest';
import { growthRatio, LINEAR_GROWTH_MAX } from '../testing/linear-time.js';
import { trimBaseUrl } from './xml.js';

describe('trimBaseUrl', () => {
  it('drops the trailing slashes of a base url', () => {
    expect(trimBaseUrl('https://jobs.example.org/')).toBe('https://jobs.example.org');
    expect(trimBaseUrl('https://jobs.example.org/careers//')).toBe('https://jobs.example.org/careers');
    expect(trimBaseUrl('https://jobs.example.org')).toBe('https://jobs.example.org');
  });

  it('finishes fast on many slashes not at the end (CodeQL js/polynomial-redos)', () => {
    const hostile = `https://x${'/'.repeat(50_000)}a`;
    expect(trimBaseUrl(hostile)).toBe(hostile);
    expect(growthRatio((size) => { trimBaseUrl(`https://x${'/'.repeat(size)}a`); }, 10_000)).toBeLessThan(LINEAR_GROWTH_MAX);
  });
});
