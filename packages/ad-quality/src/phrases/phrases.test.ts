import { QUALITY_CATEGORIES } from '@tt/domain';
import { describe, expect, it } from 'vitest';
import { ENGLISH_PHRASES, ITALIAN_PHRASES } from './index.js';

describe.each([
  ['italian', ITALIAN_PHRASES],
  ['english', ENGLISH_PHRASES],
])('%s dictionary', (_name, entries) => {
  it('has at least 40 unique entries', () => {
    expect(entries.length).toBeGreaterThanOrEqual(40);
    expect(new Set(entries.map((item) => item.phrase.toLowerCase())).size).toBe(entries.length);
  });
  it('maps every entry to a known category', () => {
    for (const item of entries) expect(QUALITY_CATEGORIES).toContain(item.category);
  });
});
