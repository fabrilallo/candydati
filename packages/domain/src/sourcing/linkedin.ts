import type { SourcingEvidence } from './sourcing.js';
import type { LinkedinProfile } from './sourcing.js';

const QUOTE_MAX = 300;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A whole word or phrase, ignoring case: "Go" never matches inside "Google". */
const wordPattern = (word: string): RegExp => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(word)}(?=$|[^\\p{L}\\p{N}])`, 'iu');

/** The line (or sentence of a long line) that mentions the word, capped. */
function passage(text: string, word: RegExp): string | null {
  for (const line of text.split('\n')) {
    if (!word.test(line)) continue;
    const sentence = line.split(/(?<=[.!?])\s+/).find((part) => word.test(part)) ?? line;
    const trimmed = sentence.trim();
    return trimmed.length <= QUOTE_MAX ? trimmed : `${trimmed.slice(0, QUOTE_MAX - 1)}…`;
  }
  return null;
}

/**
 * What a LinkedIn profile shows about each criterion: the passage that mentions it (headline first, then the rest of the
 * visible text), and the location when it contains the one asked for. Deterministic, no model, never a score.
 */
export function linkedinEvidence(profile: LinkedinProfile, criteria: { readonly keywords: readonly string[]; readonly location: string | null }): SourcingEvidence[] {
  const sources = [profile.headline ?? '', profile.text].join('\n');
  const keywords = criteria.keywords.flatMap((keyword) => {
    const found = passage(sources, wordPattern(keyword));
    return found ? [{ criterion: keyword, text: found, where: 'LinkedIn' }] : [];
  });
  const location = criteria.location && profile.location && profile.location.toLowerCase().includes(criteria.location.toLowerCase()) ? [{ criterion: criteria.location, text: profile.location, where: 'LinkedIn' }] : [];
  return [...keywords, ...location];
}

