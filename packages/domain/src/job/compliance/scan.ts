import type { Locale } from '../../platform/config.js';
import type { Fragment } from './fold.js';
import { quote } from './fold.js';
import { PATTERNS } from './patterns.js';
import { suggestionFor } from './suggestions.js';
import type { ComplianceIssue } from './types.js';

const inScope = (scope: 'mustHave' | 'other' | undefined, path: string): boolean => {
  if (scope === undefined) return true;
  const mustHave = path.startsWith('requirements.mustHave');
  return scope === 'mustHave' ? mustHave : !mustHave;
};

/** Runs the pattern tables of one language over the fragments: explicit gender requirements and discriminatory wording. */
export function scanPatterns(fragments: readonly Fragment[], locale: Locale): readonly ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const seen = new Set<string>();
  for (const frag of fragments) {
    for (const pattern of PATTERNS) {
      if (pattern.locale !== locale || !inScope(pattern.scope, frag.path)) continue;
      for (const found of frag.folded.matchAll(pattern.regex)) {
        const index = found.index ?? 0;
        if (pattern.unless?.test(frag.folded.slice(index + found[0].length))) continue;
        const match = quote(frag, index, found[0].length);
        const key = `${frag.path}|${pattern.rule}|${match.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        issues.push({ path: frag.path, rule: pattern.rule, detail: { match, suggestion: suggestionFor(pattern.kind, locale) } });
      }
    }
  }
  return issues;
}
