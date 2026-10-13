import type { Locale } from '../../platform/config.js';
import type { Fragment } from './fold.js';
import { quote } from './fold.js';
import { suggestionFor } from './suggestions.js';
import type { ComplianceIssue } from './types.js';

const MENTION =
  /\bcategori[ae]\s+protett[ae]\b|\bl\.?\s*68\b(?!\s*%)|\blegge\s+(?:n\.?\s*)?68\b|\bcollocamento\s+mirato\b|\bhandicap\w*|\binvalid(?:[oiae]|it\w*)\b|\bdiversamente\s+abil\w+|\bportatori\s+di\s+handicap\b/;
const LAW = /\b68\s*\/\s*(?:19)?99\b/;
const LISTS = /\bcollocamento\s+mirato\b|\bliste\b/;

/**
 * WARNS when the ad mentions protected categories (L. 68/99) without the correct wording: "iscritti alle liste del
 * collocamento mirato ai sensi della L. 68/99". The correct sentence is the suggestion.
 */
export function protectedCategoriesWording(fragments: readonly Fragment[], locale: Locale): readonly ComplianceIssue<'protected_categories_wording'>[] {
  return fragments.flatMap((frag) => {
    const found = MENTION.exec(frag.folded);
    if (found === null || (LAW.test(frag.folded) && LISTS.test(frag.folded))) return [];
    return [
      {
        path: frag.path,
        rule: 'protected_categories_wording' as const,
        detail: { match: quote(frag, found.index, found[0].length), suggestion: suggestionFor('protected_categories', locale) },
      },
    ];
  });
}
