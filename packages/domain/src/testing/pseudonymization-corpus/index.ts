import { GERMAN_CVS } from './de.js';
import { ENGLISH_CVS } from './en.js';
import { SPANISH_CVS } from './es.js';
import { FRENCH_CVS } from './fr.js';
import { ITALIAN_CVS } from './it.js';
import type { CorpusCv } from './types.js';

export { CORPUS_LANGUAGES, scoreCorpus, type LanguageScore } from './measure.js';
export type { CorpusCv, CorpusLanguage, KnownGap } from './types.js';

/** The pseudonymization corpus: synthetic CVs in five languages, four per language at least. */
export const PSEUDONYMIZATION_CORPUS: readonly CorpusCv[] = [...ITALIAN_CVS, ...ENGLISH_CVS, ...FRENCH_CVS, ...GERMAN_CVS, ...SPANISH_CVS];
