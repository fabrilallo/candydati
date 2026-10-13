import { describe, expect, it } from 'vitest';
import { isSafePersonName, personNameSchema, safePersonNameOrEmpty } from './person-name.js';

describe('person names', () => {
  it.each(['Ada', "Anne-Marie O'Neil", 'José Álvarez', '李雷', 'Dr. Smith Jr.'])('accepts %s', (name) => {
    expect(isSafePersonName(name)).toBe(true);
  });

  it.each([
    'https://evil.example/login',
    'http://x',
    'see://x',
    'WWW.evil.example',
    'a@b.c',
    '<b>Ada</b>',
    'Ada>',
    'Ada\nLovelace',
    'Ada\u0000',
    'Ada​\u0007',
  ])('refuses %j', (name) => {
    expect(isSafePersonName(name)).toBe(false);
  });

  it('trims, bounds the length and reports a stable issue message', () => {
    expect(personNameSchema.parse('  Ada  ')).toBe('Ada');
    expect(personNameSchema.safeParse('').success).toBe(false);
    expect(personNameSchema.safeParse('x'.repeat(121)).success).toBe(false);
    const result = personNameSchema.safeParse('https://evil.example');
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual(['name_not_allowed']);
  });

  it('turns an unsafe imported name into an empty one', () => {
    expect(safePersonNameOrEmpty('Ada')).toBe('Ada');
    expect(safePersonNameOrEmpty('www.evil.example')).toBe('');
  });
});
