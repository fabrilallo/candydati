import { describe, expect, it } from 'vitest';
import { hasText, optionalLocalizedSchema, paragraphsOf, plainTextSchema, requiredLocalizedSchema, resolveText } from './localized.js';

describe('plainTextSchema', () => {
  it('trims, normalises new lines and removes control and bidi characters', () => {
    expect(plainTextSchema(100).parse('  Ciao\r\nmondo\u0007‮  ')).toBe('Ciao\nmondo');
  });

  it('collapses more than one blank line', () => {
    expect(plainTextSchema(100).parse('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('enforces the limit on the cleaned text', () => {
    expect(plainTextSchema(5).safeParse('12345').success).toBe(true);
    expect(plainTextSchema(5).safeParse('123456').error?.issues[0]?.message).toBe('too_long');
  });

  it('keeps markup as plain characters (it is rendered as text, never as HTML)', () => {
    expect(plainTextSchema(100).parse('<b>hi</b>')).toBe('<b>hi</b>');
  });
});

describe('localized text', () => {
  it('drops empty languages', () => {
    expect(optionalLocalizedSchema(20).parse({ it: 'Ciao', en: '   ' })).toEqual({ it: 'Ciao' });
  });

  it('refuses unknown languages', () => {
    expect(optionalLocalizedSchema(20).safeParse({ fr: 'Bonjour' }).success).toBe(false);
  });

  it('requires at least one language when required', () => {
    expect(requiredLocalizedSchema(20).safeParse({}).error?.issues[0]?.message).toBe('required');
    expect(requiredLocalizedSchema(20).safeParse({ en: ' ' }).success).toBe(false);
    expect(requiredLocalizedSchema(20).parse({ en: 'Hi' })).toEqual({ en: 'Hi' });
  });

  it('tells whether anything was written', () => {
    expect(hasText(undefined)).toBe(false);
    expect(hasText({})).toBe(false);
    expect(hasText({ it: 'x' })).toBe(true);
  });
});

describe('resolveText', () => {
  it('prefers the visitor language, then the default language, then any', () => {
    expect(resolveText({ it: 'Ciao', en: 'Hi' }, 'en', 'it')).toBe('Hi');
    expect(resolveText({ it: 'Ciao' }, 'en', 'it')).toBe('Ciao');
    expect(resolveText({ en: 'Hi' }, 'it', 'it')).toBe('Hi');
    expect(resolveText({}, 'it', 'it')).toBe('');
    expect(resolveText(undefined, 'it', 'en')).toBe('');
  });
});

describe('paragraphsOf', () => {
  it('splits on blank lines and keeps single line breaks', () => {
    expect(paragraphsOf('Uno\ndue\n\n  Tre  \n\n\n')).toEqual(['Uno\ndue', 'Tre']);
    expect(paragraphsOf('')).toEqual([]);
  });
});
