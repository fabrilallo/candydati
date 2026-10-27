import type { AnnotatedFragment } from '../detect.js';
import { hasNumber, wordCount } from '../text.js';
import { BALANCE_TERMS, CULTURE_TERMS, GROWTH_TERMS, MEASURABLE_TERMS, containsTerm } from './concrete.js';
import { result, type CategoryResult } from './result.js';
import type { FragmentKey } from '../fragments.js';

export const MIN_LIST_ITEMS = 3;
/** Share of vague items from which a list can no longer score 1. */
export const VAGUE_SHARE_LIMIT = 0.5;
/** Share of a text covered by stock phrases from which it counts as "mostly vague". */
export const MOSTLY_VAGUE_COVERAGE = 0.5;
export const SPECIFIC_SHARE_MIN = 0.6;
export const MIN_SPECIFIC_WORDS = 3;

/** Filler fragments count as absent: length or number of items never stand in for content. */
const itemsOf = (annotated: readonly AnnotatedFragment[], key: FragmentKey): readonly AnnotatedFragment[] =>
  annotated.filter(({ fragment, filler }) => fragment.key === key && !filler);

const share = (count: number, total: number): number => (total === 0 ? 0 : count / total);

const isVague = (item: AnnotatedFragment): boolean => item.hits.length > 0;

/** Common gate of the list categories: empty -> 0, too short or mostly vague -> 0.5, otherwise decided by `strong`. */
function scoreList(items: readonly AnnotatedFragment[], strong: (items: readonly AnnotatedFragment[]) => boolean): CategoryResult {
  if (items.length === 0) return result(0);
  const vagueShare = share(items.filter(isVague).length, items.length);
  if (items.length < MIN_LIST_ITEMS) return result(0.5, 'partial');
  if (vagueShare >= VAGUE_SHARE_LIMIT) return result(0.5, 'vague');
  return strong(items) ? result(1) : result(0.5, 'partial');
}

const isSpecific = (item: AnnotatedFragment): boolean =>
  !isVague(item) && (hasNumber(item.fragment.text) || wordCount(item.fragment.text) >= MIN_SPECIFIC_WORDS);

export const scoreRequirements = (annotated: readonly AnnotatedFragment[]): CategoryResult =>
  scoreList(itemsOf(annotated, 'requirements'), (items) => share(items.filter(isSpecific).length, items.length) >= SPECIFIC_SHARE_MIN);

export const scoreResponsibilities = (annotated: readonly AnnotatedFragment[]): CategoryResult =>
  scoreList(itemsOf(annotated, 'responsibilities'), (items) =>
    items.some(({ fragment }) => hasNumber(fragment.text) || containsTerm(fragment.text, MEASURABLE_TERMS)),
  );

export const scoreBenefits = (annotated: readonly AnnotatedFragment[]): CategoryResult =>
  scoreList(itemsOf(annotated, 'benefits'), (items) => items.some(({ fragment }) => hasNumber(fragment.text)));

export const scoreTechnologies = (annotated: readonly AnnotatedFragment[]): CategoryResult =>
  scoreList(itemsOf(annotated, 'technologies'), () => true);

const coverage = (item: AnnotatedFragment): number =>
  share(
    item.hits.reduce((sum, hit) => sum + (hit.end - hit.start), 0),
    item.fragment.text.length,
  );

/** Free-text categories: empty -> 0, mostly vague or without concrete elements -> 0.5, concrete -> 1. */
function scoreText(annotated: readonly AnnotatedFragment[], key: FragmentKey, terms: readonly string[]): CategoryResult {
  const [item] = itemsOf(annotated, key);
  if (item === undefined) return result(0);
  if (coverage(item) >= MOSTLY_VAGUE_COVERAGE) return result(0.5, 'vague');
  const concrete = hasNumber(item.fragment.text) || containsTerm(item.fragment.text, terms);
  return concrete ? result(1) : result(0.5, 'partial');
}

export const scoreGrowth = (annotated: readonly AnnotatedFragment[]): CategoryResult => scoreText(annotated, 'growth', GROWTH_TERMS);
export const scoreBalance = (annotated: readonly AnnotatedFragment[]): CategoryResult =>
  scoreText(annotated, 'workLifeBalance', BALANCE_TERMS);
export const scoreCulture = (annotated: readonly AnnotatedFragment[]): CategoryResult => scoreText(annotated, 'culture', CULTURE_TERMS);
