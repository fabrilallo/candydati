import type { Locale } from '../../platform/config.js';
import type { Fragment } from './fold.js';
import { quote } from './fold.js';
import { hasInclusiveMarker } from './markers.js';
import { lookupNoun } from './nouns.js';
import { suggestionFor } from './suggestions.js';
import type { ComplianceIssue } from './types.js';

const PHRASES =
  /\b(?:il\s+candidato(?:\s+ideale)?|sara\s+(?:inserito|affiancato|formato)|il\s+neoassunto|il\s+nuovo\s+collega|il\s+professionista)\b/g;
const SEEKING = /\b(?:cerchiamo|cerco|cercasi|ricerchiamo|selezioniamo|assumiamo)\s+(?:un|uno|il)\s+([a-z]+)\b/g;
const INCLUSIVE_NEXT = /^\s*[/(]/;

/**
 * WARNS about masculine-only phrasing in the body ("il candidato ideale", "sarà inserito", "cerchiamo uno sviluppatore")
 * when nothing in the ad carries an inclusive marker. Never blocking: the rule only blocks titles and explicit requests.
 */
export function masculinePhrasing(fragments: readonly Fragment[], locale: Locale): readonly ComplianceIssue<'gender_masculine_phrasing'>[] {
  if (locale !== 'it' || fragments.some((frag) => hasInclusiveMarker(frag.folded))) return [];
  const issues: ComplianceIssue<'gender_masculine_phrasing'>[] = [];
  for (const frag of fragments.filter((candidate) => candidate.path !== 'title')) {
    const hits = [
      ...[...frag.folded.matchAll(PHRASES)].map((m) => ({ index: m.index ?? 0, length: m[0].length })),
      ...[...frag.folded.matchAll(SEEKING)]
        .filter((m) => lookupNoun(m[1] ?? '')?.gender === 'm')
        .map((m) => ({ index: m.index ?? 0, length: m[0].length })),
    ].filter((hit) => !INCLUSIVE_NEXT.test(frag.folded.slice(hit.index + hit.length)));
    const [first] = hits;
    if (first !== undefined) {
      issues.push({
        path: frag.path,
        rule: 'gender_masculine_phrasing',
        detail: { match: quote(frag, first.index, first.length), suggestion: suggestionFor('masculine_phrasing', locale) },
      });
    }
  }
  return issues;
}
