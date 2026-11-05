import type { CorpusCv, CorpusLanguage } from './types.js';

export interface LanguageScore {
  readonly cvs: number;
  /** Distinct strings that should disappear: `mustRemove` plus `knownGaps`. */
  readonly sensitive: number;
  readonly removed: number;
  /** Sensitive strings still in the output: the measured leaks, as `cv id: string`. */
  readonly leaked: readonly string[];
  /** `mustKeep` strings the pseudonymization removed (over-masking), as `cv id: string`. */
  readonly lost: readonly string[];
}

export const CORPUS_LANGUAGES: readonly CorpusLanguage[] = ['it', 'en', 'fr', 'de', 'es'];

const scoreCv = (cv: CorpusCv, clean: (cv: CorpusCv) => string): LanguageScore => {
  const output = clean(cv);
  const sensitive = [...cv.mustRemove, ...cv.knownGaps.map((gap) => gap.text)];
  const leaked = sensitive.filter((text) => output.includes(text)).map((text) => `${cv.id}: ${text}`);
  const lost = cv.mustKeep.filter((text) => !output.includes(text)).map((text) => `${cv.id}: ${text}`);
  return { cvs: 1, sensitive: sensitive.length, removed: sensitive.length - leaked.length, leaked, lost };
};

const add = (a: LanguageScore, b: LanguageScore): LanguageScore => ({
  cvs: a.cvs + b.cvs,
  sensitive: a.sensitive + b.sensitive,
  removed: a.removed + b.removed,
  leaked: [...a.leaked, ...b.leaked],
  lost: [...a.lost, ...b.lost],
});

const EMPTY: LanguageScore = { cvs: 0, sensitive: 0, removed: 0, leaked: [], lost: [] };

/** What a pseudonymizer removes from the corpus, per language: the numbers ADR 0010 reports. */
export function scoreCorpus(cvs: readonly CorpusCv[], clean: (cv: CorpusCv) => string): Readonly<Record<CorpusLanguage, LanguageScore>> {
  const score = (language: CorpusLanguage): LanguageScore =>
    cvs.filter((cv) => cv.language === language).map((cv) => scoreCv(cv, clean)).reduce(add, EMPTY);
  return Object.fromEntries(CORPUS_LANGUAGES.map((language) => [language, score(language)])) as Record<CorpusLanguage, LanguageScore>;
}
