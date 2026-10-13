import { describe, expect, it } from 'vitest';
import { assertStorageKey, isValidStorageKey } from './keys.js';
import { InvalidStorageKeyError } from './types.js';

describe('storage keys', () => {
  it.each(['a', 'org-1/cv/abc_1.pdf', '0/x.y-z', 'organizations/GqZg6OlW0ez/applications/1e20-d8/cv'])('accepts %s', (key) => {
    expect(isValidStorageKey(key)).toBe(true);
    expect(assertStorageKey(key)).toBe(key);
  });

  it.each(['', '/abs', 'a/../b', 'a..b', 'a//b', 'a/', 'a b', 'a\\b', 'a\nb', `a${'b'.repeat(251)}`, '-x'])(
    'rejects %j',
    (key) => {
      expect(isValidStorageKey(key)).toBe(false);
      expect(() => assertStorageKey(key)).toThrow(InvalidStorageKeyError);
    },
  );

  it('accepts the maximum length', () => {
    expect(isValidStorageKey(`a${'b'.repeat(250)}`)).toBe(true);
  });
});
