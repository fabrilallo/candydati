import type { Fragment } from './fold.js';
import { hasInclusiveMarker } from './markers.js';
import { lookupNoun, pluralFeminine, pluralMasculine, type NounMatch } from './nouns.js';
import type { ComplianceIssue } from './types.js';

/** Words before a noun that show it is not the person hired ("ufficio tecnico", "responsabile degli addetti"). */
const NOT_THE_ROLE_BEFORE = new Set([
  'di', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'per', 'con', 'da', 'nel', 'nella', 'nei', 'nelle', 'sul', 'sulla', 'presso', 'tra', 'fra',
  'ufficio', 'reparto', 'area', 'settore', 'servizio', 'supporto', 'assistenza', 'team', 'dipartimento', 'direzione', 'divisione', 'comparto',
  'gestione', 'linea', 'squadra', 'gruppo', 'personale',
]);
/** Words that may precede an adjectival noun that still opens the title ("Senior Tecnico ..."). */
const LEAD_INS = new Set(['junior', 'senior', 'jr', 'sr', 'lead', 'capo', 'vice', 'assistente', 'aiuto', 'primo', 'secondo', 'nuovo', 'un', 'uno', 'il', 'cercasi', 'cerchiamo']);

interface Token {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

const tokensOf = (folded: string): readonly Token[] =>
  [...folded.matchAll(/[a-z]+/g)].map((m) => ({ word: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));

const isCandidate = (tokens: readonly Token[], position: number, match: NounMatch): boolean => {
  const before = tokens.slice(0, position).map((token) => token.word);
  const previous = before[before.length - 1];
  if (previous !== undefined && NOT_THE_ROLE_BEFORE.has(previous)) return false;
  return !match.entry.adjectival || before.every((word) => LEAD_INS.has(word));
};

const commonPrefixLength = (a: string, b: string): number => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
};

/** Does the text right after the noun carry the other gender ("/trice", "/a", "(a)", "o sviluppatrice")? */
function hasInclusiveSuffix(folded: string, end: number, match: NounMatch): boolean {
  const next = /^\s*([/(-]|(?:o|e)\s)\s*([a-z]+)/.exec(folded.slice(end));
  const separator = next?.[1] ?? '';
  const candidate = next?.[2];
  if (candidate === undefined) return false;
  if (candidate.length === 1) return /[/(]/.test(separator) && 'aeoi'.includes(candidate);
  const { masculine, feminine } = match.entry;
  const forms = match.gender === 'm' ? [feminine, pluralFeminine(feminine)] : [masculine, pluralMasculine(masculine)];
  return forms.some((form) => form === candidate || (candidate.length >= 3 && form.endsWith(candidate)));
}

const slashSuffix = (match: NounMatch): string => {
  const { masculine, feminine } = match.entry;
  if (feminine.endsWith('trice')) return 'trice';
  return feminine.slice(commonPrefixLength(masculine, feminine));
};

function suggestTitle(title: string, token: Token, match: NounMatch): string {
  if (match.gender === 'm' && !match.plural) {
    return `${title.slice(0, token.end)}/${slashSuffix(match)}${title.slice(token.end)}`;
  }
  return `${title} (m/f)`;
}

/**
 * BLOCKS a title built on a masculine-only (or feminine-only) job noun without an inclusive marker. Returns the first
 * offending noun. Words that are part of a department or a preposition phrase are not the role and are skipped.
 */
export function genderExclusiveTitle(title: Fragment): ComplianceIssue<'gender_exclusive_title'> | undefined {
  if (hasInclusiveMarker(title.folded)) return undefined;
  const tokens = tokensOf(title.folded);
  let counterpart: NounMatch['entry'] | undefined;
  for (const [position, token] of tokens.entries()) {
    const match = lookupNoun(token.word);
    if (match === undefined || match.entry === counterpart || !isCandidate(tokens, position, match)) continue;
    if (hasInclusiveSuffix(title.folded, token.end, match)) {
      counterpart = match.entry;
      continue;
    }
    return {
      path: title.path,
      rule: 'gender_exclusive_title',
      detail: { match: title.text.slice(token.start, token.end), suggestion: suggestTitle(title.text, token, match) },
    };
  }
  return undefined;
}
