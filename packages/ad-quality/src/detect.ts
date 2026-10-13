import type { JobContent, Locale, QualityCategory, VaguePhrase } from '@tt/domain';
import { ENGLISH_PHRASES, ITALIAN_PHRASES, DEFAULT_SUGGESTIONS, type PhraseEntry } from './phrases/index.js';
import { fragmentsOf, type Fragment } from './fragments.js';
import { fold, isWordChar } from './text.js';

const MAX_VAGUE_PHRASES = 30;

interface Compiled {
  readonly folded: string;
  readonly entry: PhraseEntry;
  readonly language: Locale;
}

const compile = (entries: readonly PhraseEntry[], language: Locale): readonly Compiled[] =>
  entries.map((item) => ({ folded: fold(item.phrase), entry: item, language }));

/** Longest phrases first, so a long phrase wins over a shorter one it contains. */
const DICTIONARY: readonly Compiled[] = [...compile(ITALIAN_PHRASES, 'it'), ...compile(ENGLISH_PHRASES, 'en')].sort(
  (a, b) => b.folded.length - a.folded.length,
);

export interface Hit {
  readonly start: number;
  readonly end: number;
  /** Exactly as written in the ad. */
  readonly text: string;
  readonly category: QualityCategory;
  readonly language: Locale;
  readonly entry: PhraseEntry;
}

export interface AnnotatedFragment {
  readonly fragment: Fragment;
  readonly hits: readonly Hit[];
}

const isBounded = (folded: string, start: number, end: number): boolean =>
  !isWordChar(folded[start - 1]) && !isWordChar(folded[end]);

const overlaps = (taken: readonly Hit[], start: number, end: number): boolean => taken.some((hit) => start < hit.end && end > hit.start);

/** Finds every stock phrase in a text, non-overlapping, in reading order. */
export function findHits(text: string): readonly Hit[] {
  const folded = fold(text);
  const taken: Hit[] = [];
  for (const compiled of DICTIONARY) {
    let from = 0;
    for (let at = folded.indexOf(compiled.folded, from); at !== -1; at = folded.indexOf(compiled.folded, from)) {
      const end = at + compiled.folded.length;
      from = at + 1;
      if (!isBounded(folded, at, end) || overlaps(taken, at, end)) continue;
      taken.push({
        start: at,
        end,
        text: text.slice(at, end),
        category: compiled.entry.category,
        language: compiled.language,
        entry: compiled.entry,
      });
    }
  }
  return [...taken].sort((a, b) => a.start - b.start);
}

export const annotate = (content: JobContent): readonly AnnotatedFragment[] =>
  fragmentsOf(content).map((fragment) => ({ fragment, hits: findHits(fragment.text) }));

const suggestionFor = (hit: Hit, language: Locale): string =>
  hit.language === language && hit.entry.suggestion !== undefined ? hit.entry.suggestion : DEFAULT_SUGGESTIONS[language][hit.category];

/** Vague phrases for the report: unique, capped, with the suggestion in the language of the ad. */
export function vaguePhrasesOf(annotated: readonly AnnotatedFragment[], language: Locale): readonly VaguePhrase[] {
  const seen = new Set<string>();
  const phrases: VaguePhrase[] = [];
  for (const { hits } of annotated) {
    for (const hit of hits) {
      const key = fold(hit.text);
      if (seen.has(key)) continue;
      seen.add(key);
      phrases.push({ text: hit.text, category: hit.category, suggestion: suggestionFor(hit, language) });
    }
  }
  return phrases.slice(0, MAX_VAGUE_PHRASES);
}

/** True when `text` occurs literally in some fragment of the ad. */
export const occursInAd = (text: string, annotated: readonly AnnotatedFragment[]): boolean =>
  text.length > 0 && annotated.some(({ fragment }) => fragment.text.includes(text));
