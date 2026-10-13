import { describe, expect, it } from 'vitest';
import { fold, fragment, quote } from './fold.js';
import { JOB_NOUNS, lookupNoun, pluralFeminine, pluralMasculine } from './nouns.js';

describe('JOB_NOUNS', () => {
  it('lists at least 60 masculine nouns with their feminine form', () => {
    expect(JOB_NOUNS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(JOB_NOUNS.map(([m]) => m)).size).toBe(JOB_NOUNS.length);
    for (const [masculine, feminine] of JOB_NOUNS) expect(feminine).not.toBe(masculine);
  });

  it.each(['analista', 'consulente', 'responsabile', 'specialista', 'manager', 'designer', 'developer', 'assistente', 'docente', 'insegnante', 'giornalista', 'farmacista', 'dentista', 'progettista', 'receptionist', 'elettricista', 'commercialista', 'autista', 'barista', 'dirigente'])(
    'does not know the neutral term %s',
    (word) => {
      expect(lookupNoun(word)).toBeUndefined();
    },
  );

  it('derives plurals', () => {
    expect(pluralMasculine('sviluppatore')).toBe('sviluppatori');
    expect(pluralMasculine('operaio')).toBe('operai');
    expect(pluralMasculine('cuoco')).toBe('cuochi');
    expect(pluralMasculine('tecnico')).toBe('tecnici');
    expect(pluralMasculine('addetto')).toBe('addetti');
    expect(pluralFeminine('sviluppatrice')).toBe('sviluppatrici');
    expect(pluralFeminine('impiegata')).toBe('impiegate');
    expect(pluralFeminine('professoressa')).toBe('professoresse');
  });

  it('finds singular and plural forms of both genders', () => {
    expect(lookupNoun('operai')).toMatchObject({ gender: 'm', plural: true });
    expect(lookupNoun('impiegate')).toMatchObject({ gender: 'f', plural: true });
    expect(lookupNoun('cuochi')).toMatchObject({ gender: 'm', plural: true });
  });

  it('never flags feminine forms that are common words', () => {
    expect(lookupNoun('commessa')).toBeUndefined();
    expect(lookupNoun('tecnica')).toBeUndefined();
    expect(lookupNoun('grafica')).toBeUndefined();
  });
});

describe('fold', () => {
  it('keeps the length so indexes map back to the original', () => {
    const text = 'Età “massima” — Perché? Ñandú ÀÈÌÒÙ';
    expect(fold(text)).toHaveLength(text.length);
    expect(fold(text)).toBe('eta “massima” - perche? nandu aeiou');
  });

  it('removes accents, lowers the case and normalises quotes and dashes', () => {
    expect(fold('ÈTÀ')).toBe('eta');
    expect(fold('bell’aspetto')).toBe("bell'aspetto");
    expect(fold('a–b—c')).toBe('a-b-c');
    expect(fold('a b')).toBe('a b');
  });

  it('quotes the original text of a match', () => {
    const frag = fragment('summary', 'Cerchiamo persone di ETÀ massima 35 anni.');
    const index = frag.folded.indexOf('eta massima');
    expect(quote(frag, index, 'eta massima'.length)).toBe('ETÀ massima');
  });

  it('survives emoji (surrogate pairs)', () => {
    expect(fold('Ciao 🎉 ÈTÀ')).toHaveLength('Ciao 🎉 ÈTÀ'.length);
  });
});
