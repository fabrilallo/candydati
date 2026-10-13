import { describe, expect, it } from 'vitest';
import { fold, hasNumber, isWordChar, wordCount } from './text.js';

describe('text', () => {
  it('folds case and accents while keeping the length', () => {
    const text = 'Possibilità di CRESCITA — è l’ora';
    expect(fold(text)).toBe("possibilita di crescita — e l'ora");
    expect(fold(text)).toHaveLength(text.length);
  });
  it('keeps characters whose folding changes the length', () => {
    expect(fold('İ')).toHaveLength(1);
  });
  it('detects word characters, digits and words', () => {
    expect(isWordChar('a')).toBe(true);
    expect(isWordChar(' ')).toBe(false);
    expect(isWordChar(undefined)).toBe(false);
    expect(hasNumber('3 anni')).toBe(true);
    expect(hasNumber('anni')).toBe(false);
    expect(wordCount('  uno due  tre ')).toBe(3);
  });
});
