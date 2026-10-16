import type { QualityCategory } from '@candydati/domain';

export interface PhraseEntry {
  /** The stock phrase in natural spelling; matching is case- and accent-insensitive. */
  readonly phrase: string;
  readonly category: QualityCategory;
  /** Overrides the default suggestion of the category. Asks for the missing fact, never invents one. */
  readonly suggestion?: string;
}

export const entry = (category: QualityCategory, phrases: readonly string[], suggestion?: string): readonly PhraseEntry[] =>
  phrases.map((phrase) => (suggestion === undefined ? { phrase, category } : { phrase, category, suggestion }));
