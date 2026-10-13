import { fold } from '../text.js';

/** Named practices and measurable terms (Italian and English), already folded. A hit marks a concrete element. */
const toTerms = (terms: readonly string[]): readonly string[] => terms.map(fold);

export const GROWTH_TERMS = toTerms([
  'budget', 'mentor', 'career ladder', 'piano di carriera', 'certificazion', 'conferenc', 'learning day', 'promozion',
  'promotion', 'revisione salarial', 'salary review', 'ore di formazione', 'hours of training', 'corsi',
]);

export const BALANCE_TERMS = toTerms([
  'ferie', 'permess', 'part-time', 'part time', 'settimana corta', '4 day', 'no meeting', 'reperibilit', 'on-call',
  'on call', 'pto', 'vacation', 'days off', 'core hours', 'fascia oraria', 'banca ore', 'parental', 'congedo',
  'smart working', 'remote days', 'giorni di',
]);

export const CULTURE_TERMS = toTerms([
  'feedback', 'retrospectiv', 'retrospective', '1:1', 'one-to-one', 'team building', 'all-hands', 'demo', 'code review',
  'pair programming', 'rfc', 'post-mortem', 'postmortem', 'open source', 'handbook', 'sondagg', 'survey', 'rituali',
  'hackathon', 'offsite', 'riunioni', 'daily',
]);

/** Words that make a responsibility measurable. */
export const MEASURABLE_TERMS = toTerms(['%', 'kpi', 'okr', 'obiettiv', 'target', 'goal', 'objective', 'metric', 'entro', 'within']);

export const containsTerm = (text: string, terms: readonly string[]): boolean => {
  const folded = fold(text);
  return terms.some((term) => folded.includes(term));
};
