import { describe, expect, it } from 'vitest';
import { growthRatio, LINEAR_GROWTH_MAX } from '../testing/linear-time.js';
import { fileStem, levenshtein, levenshteinRatio, nameFromFileName, nameKey, nameSimilarity, normalizeEmail, normalizeText, phoneDigits, splitFullName } from './names.js';

describe('normalizeText and nameKey', () => {
  it('drops accents, case and punctuation', () => {
    expect(normalizeText("  José-Maria  O'Neil ")).toBe('jose maria o neil');
    expect(normalizeText('Müller Straße')).toBe('muller strasse');
    expect(normalizeText('')).toBe('');
  });
  it('ignores the order of the words', () => {
    expect(nameKey('Rossi Mario')).toBe(nameKey('mario ROSSI'));
    expect(nameKey('Zoë Müller')).toBe(nameKey('muller, zoe'));
    expect(nameKey('Mario Rossi')).not.toBe(nameKey('Mario Rossini'));
  });
});

describe('levenshtein', () => {
  it('counts edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });
  it('turns it into a ratio', () => {
    expect(levenshteinRatio('', '')).toBe(1);
    expect(levenshteinRatio('abcd', 'abcd')).toBe(1);
    expect(levenshteinRatio('abcd', 'wxyz')).toBe(0);
    expect(levenshteinRatio('giuseppe', 'giuseppa')).toBeCloseTo(0.875);
  });
  it('compares names without order, accents or case', () => {
    expect(nameSimilarity('Niccolò Bianchi', 'BIANCHI Niccolo')).toBe(1);
    expect(nameSimilarity('Francesca Esposito', 'Francesco Esposito')).toBeGreaterThan(0.9);
    expect(nameSimilarity('Mario Rossi', 'Luca Verdi')).toBeLessThan(0.5);
  });
});

describe('splitFullName', () => {
  it.each([
    ['Mario Rossi', 'Mario', 'Rossi'],
    ['ROSSI Mario', 'Mario', 'ROSSI'],
    ['Maria Grazia De Luca', 'Maria Grazia', 'De Luca'],
    ['Anna Maria Bianchi', 'Anna', 'Maria Bianchi'],
    ['Rossi, Mario', 'Mario', 'Rossi'],
    ['Cher', 'Cher', ''],
    ['', '', ''],
  ])('%s', (full, firstName, lastName) => {
    expect(splitFullName(full)).toEqual({ firstName, lastName });
  });
  it.each([
    ['Rossi;Mario', 'Mario', 'Rossi'],
    [' Rossi ,   Maria Grazia ', 'Maria Grazia', 'Rossi'],
    ['Rossi, Mario, Jr', 'Rossi', 'Mario Jr'],
    [', Mario', 'Mario', ''],
    ['Rossi,', 'Rossi', ''],
  ])('reads "last, first" only with one separator: %s', (full, firstName, lastName) => {
    expect(splitFullName(full)).toEqual({ firstName, lastName });
  });
  it('finishes fast on a separator followed by a long run of spaces (CodeQL js/polynomial-redos)', () => {
    const run = (size: number) => {
      splitFullName(`+,${' '.repeat(size)};x`);
      splitFullName(`a,${' '.repeat(size)}b`);
    };
    run(50_000);
    expect(growthRatio(run, 10_000)).toBeLessThan(LINEAR_GROWTH_MAX);
  });
  it('keeps an all-caps full name as written', () => {
    expect(splitFullName('MARIO ROSSI')).toEqual({ firstName: 'MARIO', lastName: 'ROSSI' });
  });
});

describe('file names, emails and phones', () => {
  it('finds the name in a CV file name', () => {
    expect(nameFromFileName('Mario_Rossi_CV_2024.pdf')).toBe('Mario Rossi');
    expect(nameFromFileName('cv/Curriculum Vitae - Giulia Bianchi (1).docx')).toBe('Giulia Bianchi');
    expect(nameFromFileName('MarioRossi.pdf')).toBe('Mario Rossi');
    expect(nameFromFileName('CV_final_2023.pdf')).toBe('');
  });
  it('compares file stems without folders, extension or case', () => {
    expect(fileStem('cvs/Mario Rossi.PDF')).toBe(fileStem('mario_rossi.docx'));
  });
  it('normalises emails', () => {
    expect(normalizeEmail(' Mailto:Mario.Rossi@Example.COM ')).toBe('mario.rossi@example.com');
    expect(normalizeEmail('<a@b.it>')).toBe('a@b.it');
    expect(normalizeEmail('not an email')).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
  it.each(['a@b', 'a@.it', 'a@b.', '@b.it', 'a@@b.it', 'a@b@c.it', 'a b@c.it', 'a@b.\tit'])('refuses %s as an email', (value) => {
    expect(normalizeEmail(value)).toBeNull();
  });
  it('refuses an address longer than 254 characters', () => {
    expect(normalizeEmail(`${'a'.repeat(249)}@b.it`)).toBe(`${'a'.repeat(249)}@b.it`);
    expect(normalizeEmail(`${'a'.repeat(250)}@b.it`)).toBeNull();
  });
  it('accepts any dot inside the domain, as before', () => {
    expect(normalizeEmail('a@b.c')).toBe('a@b.c');
    expect(normalizeEmail('a.b@c.d.e')).toBe('a.b@c.d.e');
    expect(normalizeEmail('x@a.b.')).toBe('x@a.b.');
  });
  it('finishes fast on a long domain of dots with no valid end (CodeQL js/polynomial-redos)', () => {
    expect(normalizeEmail(`!@!.${'!.'.repeat(25_000)}@`)).toBeNull();
    expect(normalizeEmail(`!@!${'.'.repeat(50_000)} `)).toBeNull();
    const run = (size: number) => {
      normalizeEmail(`!@!.${'!.'.repeat(size / 2)}@`);
      normalizeEmail(`!@!${'.'.repeat(size)} `);
    };
    expect(growthRatio(run, 10_000)).toBeLessThan(LINEAR_GROWTH_MAX);
  });
  it('compares phones by digits', () => {
    expect(phoneDigits('+39 333 123 4567')).toBe(phoneDigits('333-1234567'));
    expect(phoneDigits('0039 333 1234567')).toBe('3331234567');
    expect(phoneDigits('+44 20 7946 0958')).toBe('442079460958');
  });
});
