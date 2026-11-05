import { describe, expect, it } from 'vitest';
import { CORPUS_LANGUAGES, PSEUDONYMIZATION_CORPUS, scoreCorpus, type CorpusCv } from '../testing/pseudonymization-corpus/index.js';
import { pseudonymizeText } from './pseudonymize.js';

const clean = (cv: CorpusCv): string => pseudonymizeText(cv.text, cv.person);

/**
 * The measured result on the corpus, reported in ADR 0010 (residual risk). A change to pseudonymizeText that moves
 * these numbers must update the ADR: `removed` counts distinct strings, `gaps` are the documented known gaps.
 */
const MEASURED = {
  it: { cvs: 4, sensitive: 53, removed: 47, gaps: 6 },
  en: { cvs: 4, sensitive: 53, removed: 49, gaps: 4 },
  fr: { cvs: 4, sensitive: 51, removed: 47, gaps: 4 },
  de: { cvs: 4, sensitive: 43, removed: 38, gaps: 5 },
  es: { cvs: 4, sensitive: 47, removed: 44, gaps: 3 },
};

describe('pseudonymization corpus', () => {
  it('has at least four CVs per language, each string written in its CV and every gap explained', () => {
    for (const language of CORPUS_LANGUAGES) {
      expect(PSEUDONYMIZATION_CORPUS.filter((cv) => cv.language === language).length).toBeGreaterThanOrEqual(4);
    }
    for (const cv of PSEUDONYMIZATION_CORPUS) {
      const strings = [...cv.mustRemove, ...cv.mustKeep, ...cv.knownGaps.map((gap) => gap.text)];
      expect(strings.filter((text) => !cv.text.includes(text)), cv.id).toEqual([]);
      expect(cv.knownGaps.filter((gap) => gap.reason.length < 20), cv.id).toEqual([]);
    }
    expect(new Set(PSEUDONYMIZATION_CORPUS.map((cv) => cv.id)).size).toBe(PSEUDONYMIZATION_CORPUS.length);
  });

  describe.each(PSEUDONYMIZATION_CORPUS.map((cv) => [cv.id, cv] as const))('%s', (_id, cv) => {
    const output = clean(cv);

    it('removes every identifying string', () => {
      expect(cv.mustRemove.filter((text) => output.includes(text))).toEqual([]);
    });

    it('keeps the first name, employers, places of work, skills and dates of periods', () => {
      expect(output.includes(cv.firstName) || output.includes(cv.firstName.toUpperCase())).toBe(true);
      expect(cv.mustKeep.filter((text) => !output.includes(text))).toEqual([]);
    });

    it('still leaks only its documented known gaps (move a gap to mustRemove once it is fixed)', () => {
      expect(cv.knownGaps.filter((gap) => !output.includes(gap.text)).map((gap) => gap.text)).toEqual([]);
    });
  });

  it('matches the numbers reported in ADR 0010', () => {
    const score = scoreCorpus(PSEUDONYMIZATION_CORPUS, clean);
    const summary = Object.fromEntries(
      CORPUS_LANGUAGES.map((language) => {
        const { cvs, sensitive, removed, leaked, lost } = score[language];
        expect(lost).toEqual([]);
        return [language, { cvs, sensitive, removed, gaps: leaked.length }];
      }),
    );
    expect(summary).toEqual(MEASURED);
  });
});
