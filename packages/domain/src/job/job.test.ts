import { describe, expect, it } from 'vitest';
import { jobSlug, SLUG_MAX } from './job.js';

describe('jobSlug', () => {
  it('builds a readable slug and appends the suffix', () => {
    expect(jobSlug('Backend Developer (Milano)', 'a1b2c3')).toBe('backend-developer-milano-a1b2c3');
  });

  it('removes accents', () => {
    expect(jobSlug('Perché no? Città à Åland', 'x1')).toBe('perche-no-citta-a-aland-x1');
  });

  it('collapses punctuation and whitespace into single hyphens', () => {
    expect(jobSlug('  C++ / Rust --- ops!!  ', 'k9')).toBe('c-rust-ops-k9');
  });

  it('falls back to the suffix alone when the title has no letters or digits', () => {
    expect(jobSlug('', 'a1b2c3')).toBe('a1b2c3');
    expect(jobSlug('!!! ???', 'a1b2c3')).toBe('a1b2c3');
  });

  it('caps the length, keeping the suffix at the end', () => {
    const slug = jobSlug('a'.repeat(200), 'abc');
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(slug.endsWith('-abc')).toBe(true);
  });

  it('never leaves a trailing hyphen where the cut falls', () => {
    const slug = jobSlug(`${'a'.repeat(75)} b`, 'abc');
    expect(slug).toBe(`${'a'.repeat(75)}-abc`);
    expect(slug).not.toContain('--');
  });
});
