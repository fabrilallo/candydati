import type { JobContent } from '../content.js';
import { textFragments } from './fragments.js';
import { genderExclusiveTitle } from './gender-title.js';
import { masculinePhrasing } from './masculine-phrasing.js';
import { protectedCategoriesWording } from './protected-categories.js';
import { scanPatterns } from './scan.js';
import {
  COMPLIANCE_BLOCKING_RULES,
  type ComplianceBlockingRule,
  type ComplianceIssue,
  type ComplianceResult,
  type ComplianceWarningRule,
} from './types.js';

export * from './types.js';

const isBlocking = (issue: ComplianceIssue): issue is ComplianceIssue<ComplianceBlockingRule> =>
  (COMPLIANCE_BLOCKING_RULES as readonly string[]).includes(issue.rule);
const isWarning = (issue: ComplianceIssue): issue is ComplianceIssue<ComplianceWarningRule> => !isBlocking(issue);

/**
 * Italian labour-law checks on the text of an ad (pure, no model). Clear violations are `blocking`, doubtful cases are
 * `warnings`. Gender rules (D.Lgs. 198/2006) apply to Italian ads only; discriminatory requirements to both languages.
 */
export function checkCompliance(content: JobContent): ComplianceResult {
  const fragments = textFragments(content);
  const title = fragments[0];
  const titleIssue = content.language === 'it' && title !== undefined ? genderExclusiveTitle(title) : undefined;
  const all: readonly ComplianceIssue[] = [
    ...(titleIssue === undefined ? [] : [titleIssue]),
    ...scanPatterns(fragments, content.language),
    ...masculinePhrasing(fragments, content.language),
    ...protectedCategoriesWording(fragments, content.language),
  ];
  return { blocking: all.filter(isBlocking), warnings: all.filter(isWarning) };
}

/** The non-blocking findings of `checkCompliance`. */
export const complianceWarnings = (content: JobContent): readonly ComplianceIssue<ComplianceWarningRule>[] => checkCompliance(content).warnings;
