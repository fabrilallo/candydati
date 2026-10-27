import type { Locale, QualityCategory, VaguePhrase } from '@candydati/domain';
import type { AnnotatedFragment } from './detect.js';
import type { FragmentKey } from './fragments.js';
import { DEFAULT_SUGGESTIONS } from './phrases/index.js';

const MAX_PHRASE_LENGTH = 300;

/** The category a fragment speaks to: where a filler fragment is reported and which score it cannot raise. */
export const FRAGMENT_CATEGORY: Record<FragmentKey, QualityCategory> = {
  title: 'role_requirements',
  summary: 'responsibilities_clarity',
  responsibilities: 'responsibilities_clarity',
  requirements: 'role_requirements',
  technologies: 'technologies',
  benefits: 'benefits',
  growth: 'growth',
  workLifeBalance: 'work_life_balance',
  culture: 'culture',
  processNotes: 'selection_process',
};

const FILLER_SUGGESTION: Record<Locale, string> = {
  it: 'Questo testo non dice nulla a chi legge (segnaposto, parole a caso o ripetute).',
  en: 'This text says nothing to a reader (placeholder, random or repeated words).',
};

const FILLER_IMPROVEMENT: Record<Locale, string> = {
  it: 'Alcuni testi sembrano segnaposto o parole a caso e non contano nel punteggio: riscrivili con informazioni reali.',
  en: 'Some texts look like placeholders or random words and do not count towards the score: rewrite them with real information.',
};

const fillersOf = (annotated: readonly AnnotatedFragment[]): readonly AnnotatedFragment[] => annotated.filter((item) => item.filler);

/** One finding per filler fragment, quoted as written, with what to write instead. */
export function fillerPhrasesOf(annotated: readonly AnnotatedFragment[], language: Locale): readonly VaguePhrase[] {
  const seen = new Set<string>();
  return fillersOf(annotated).flatMap(({ fragment }) => {
    const text = fragment.text.trim().slice(0, MAX_PHRASE_LENGTH);
    const category = FRAGMENT_CATEGORY[fragment.key];
    if (text.length === 0 || seen.has(text)) return [];
    seen.add(text);
    return [{ text, category, suggestion: `${FILLER_SUGGESTION[language]} ${DEFAULT_SUGGESTIONS[language][category]}` }];
  });
}

/** The first improvement when the ad holds filler: nothing else matters until the text says something. */
export const fillerImprovementsOf = (annotated: readonly AnnotatedFragment[], language: Locale): readonly string[] =>
  fillersOf(annotated).length === 0 ? [] : [FILLER_IMPROVEMENT[language]];

/** Title and summary are reported when filler, but they belong to no category: they neither fill nor empty one. */
const SCORED_KEYS: ReadonlySet<FragmentKey> = new Set(['responsibilities', 'requirements', 'technologies', 'benefits', 'growth', 'workLifeBalance', 'culture']);

const categoriesOf = (items: readonly AnnotatedFragment[]): readonly QualityCategory[] =>
  items.filter(({ fragment }) => SCORED_KEYS.has(fragment.key)).map(({ fragment }) => FRAGMENT_CATEGORY[fragment.key]);

/** Categories whose text is all filler: there is something written, but nothing to score. */
export function hollowCategories(annotated: readonly AnnotatedFragment[]): ReadonlySet<QualityCategory> {
  const filled = new Set(categoriesOf(annotated.filter((item) => !item.filler)));
  return new Set(categoriesOf(fillersOf(annotated)).filter((category) => !filled.has(category)));
}
