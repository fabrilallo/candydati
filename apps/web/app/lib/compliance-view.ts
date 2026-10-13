import type { PublishIssue } from '@tt/domain'
import { fixesFor, type ComplianceFix } from './compliance-fix'
import { fieldIdOf } from './job-issues'
import type { JobForm } from './job-form'
import { isComplianceRule, type ComplianceIssue } from './phase9-contract'

/** A compliance finding as the editor shows it: what, where, why, and the one-click fixes. */
export interface ComplianceItem {
  readonly key: string
  readonly rule: string
  readonly path: string
  readonly fieldId: string
  readonly blocking: boolean
  /** The offending words as written in the ad. */
  readonly match: string
  /** Why it is a problem and what to write instead, in the language of the ad (from the domain). */
  readonly suggestion: string
  /** Translation key (UI language) of the rule. */
  readonly messageKey: string
  readonly fixes: readonly ComplianceFix[]
}

export interface ComplianceView {
  readonly blocking: readonly ComplianceItem[]
  readonly warnings: readonly ComplianceItem[]
}

type Finding = Pick<PublishIssue, 'path' | 'rule' | 'detail'> | ComplianceIssue

/** The list field of a list item (`requirements.mustHave.2` -> the `requirements.mustHave` fieldset's item 2). */
const fieldOf = (path: string): string => fieldIdOf(path)

const toItem = (form: JobForm, finding: Finding, blocking: boolean): ComplianceItem | null => {
  const detail = finding.detail
  if (!detail) return null
  const issue = { rule: finding.rule, path: finding.path, match: detail.match, suggestion: detail.suggestion }
  return {
    key: `${finding.rule}|${finding.path}|${detail.match}`,
    rule: finding.rule,
    path: finding.path,
    fieldId: fieldOf(finding.path),
    blocking,
    match: detail.match,
    // For a title the domain's suggestion is the rewritten title itself: it is offered as a fix, not repeated as advice.
    suggestion: finding.rule === 'gender_exclusive_title' ? '' : detail.suggestion,
    messageKey: `job.compliance.rules.${finding.rule}`,
    fixes: fixesFor(form, issue),
  }
}

const present = <T>(value: T | null): value is T => value !== null

/** Pure: the blocking findings among the publish issues, and the warnings, ready to render. */
export const complianceView = (form: JobForm, issues: readonly PublishIssue[], warnings: readonly ComplianceIssue[]): ComplianceView => ({
  blocking: issues.filter((issue) => isComplianceRule(issue.rule)).map((issue) => toItem(form, issue, true)).filter(present),
  warnings: warnings.map((warning) => toItem(form, warning, false)).filter(present),
})

/** What the preview underlines: the offending words, blocking ones first so they win an overlap. */
export interface ComplianceMark {
  readonly text: string
  readonly item: ComplianceItem
}

export const complianceMarks = (view: ComplianceView): readonly ComplianceMark[] =>
  [...view.blocking, ...view.warnings].filter((item) => item.match.trim() !== '').map((item) => ({ text: item.match, item }))
