import type { Locale } from '@candydati/domain';
import type { FragmentKey } from './fragments.js';
import { DUMMY_TEXT_WORDS, KEYBOARD_RUNS, PLACEHOLDER_WORDS, STOP_WORDS, WHOLE_TEXT_FILLERS } from './substance-words.js';
import { fold } from './text.js';

/**
 * Deterministic "does this text say anything?" check. A fragment made of placeholders, keyboard mashing, lorem ipsum,
 * the same word over and over or only stop words is filler: it counts as absent for the score, however long it is.
 */

/** A list item may be a single word ("Kubernetes"); a paragraph needs at least two. */
export type FragmentKind = 'item' | 'prose';

const MIN_INFORMATIVE_WORDS: Record<FragmentKind, number> = { item: 1, prose: 2 };
/** Share of junk among the meaningful words from which the whole fragment is filler. */
export const JUNK_SHARE_LIMIT = 0.5;
/** Below this share of distinct words, a fragment of at least `REPETITION_MIN_WORDS` words is a repetition. */
export const DISTINCT_SHARE_MIN = 0.5;
const REPETITION_MIN_WORDS = 3;
const MASH_MIN_LENGTH = 4;
const CONSONANT_RUN = /[b-df-hj-np-tv-xz]{6,}/;
const REPEATED_UNIT = /^(.{1,3})\1+$/;
const VOWEL = /[aeiouy]/;
const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}+#]*/gu;
const NUMBER = /^\p{N}+$/u;

const PROSE_KEYS: ReadonlySet<FragmentKey> = new Set(['summary', 'growth', 'workLifeBalance', 'culture']);

export const kindOf = (key: FragmentKey): FragmentKind => (PROSE_KEYS.has(key) ? 'prose' : 'item');

type TokenClass = 'number' | 'stop' | 'junk' | 'word';

interface Token {
  readonly folded: string;
  readonly kind: TokenClass;
}

const isAcronym = (original: string): boolean => original.length > 1 && original === original.toUpperCase();

/** Keyboard mashing and stuttering: "asdfgh", "sdfghjkl", "lalala", "xxxx". Acronyms (HTML, GDPR) are spared. */
export function isMashed(original: string, folded: string): boolean {
  if (folded.length < MASH_MIN_LENGTH) return false;
  if (REPEATED_UNIT.test(folded) || KEYBOARD_RUNS.some((run) => folded.includes(run))) return true;
  if (isAcronym(original)) return false;
  return !VOWEL.test(folded) || CONSONANT_RUN.test(folded);
}

const classify = (original: string, stopWords: ReadonlySet<string>): Token => {
  const folded = fold(original);
  if (NUMBER.test(folded)) return { folded, kind: 'number' };
  if (stopWords.has(folded) || STOP_WORDS.en.has(folded)) return { folded, kind: 'stop' };
  if (PLACEHOLDER_WORDS.has(folded) || isMashed(original, folded)) return { folded, kind: 'junk' };
  return { folded, kind: 'word' };
};

const tokensOf = (text: string, language: Locale): readonly Token[] =>
  Array.from(text.matchAll(TOKEN), ([original]) => classify(original, STOP_WORDS[language]));

const isWholeTextFiller = (tokens: readonly Token[]): boolean =>
  WHOLE_TEXT_FILLERS.has(
    tokens
      .filter((token) => token.kind !== 'number')
      .map((token) => token.folded)
      .join(' '),
  );

const isRepetition = (meaningful: readonly Token[]): boolean =>
  meaningful.length >= REPETITION_MIN_WORDS && new Set(meaningful.map((token) => token.folded)).size / meaningful.length < DISTINCT_SHARE_MIN;

/** True when the text carries no information a candidate could use. */
export function isFiller(text: string, language: Locale, kind: FragmentKind = 'item'): boolean {
  const tokens = tokensOf(text, language);
  if (tokens.some((token) => DUMMY_TEXT_WORDS.has(token.folded)) || isWholeTextFiller(tokens)) return true;
  const meaningful = tokens.filter((token) => token.kind === 'word' || token.kind === 'junk');
  const informative = meaningful.filter((token) => token.kind === 'word');
  if (informative.length < MIN_INFORMATIVE_WORDS[kind]) return true;
  if ((meaningful.length - informative.length) / meaningful.length >= JUNK_SHARE_LIMIT) return true;
  return isRepetition(meaningful);
}
