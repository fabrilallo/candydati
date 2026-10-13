import type { PublishIssue, PublishRule } from '@tt/domain'

/** Id of the form control (or fieldset) that holds the content path, e.g. `salary.max` -> `job-field-salary-max`. */
export const fieldIdOf = (path: string): string => `job-field-${path.replace(/\./g, '-')}`

export interface IssueView {
  readonly path: string
  readonly rule: PublishRule
  readonly fieldId: string
  /** Translation key of the field name. */
  readonly labelKey: string
  /** Translation key of what is wrong. */
  readonly messageKey: string
}

export const describeIssues = (issues: readonly PublishIssue[]): readonly IssueView[] =>
  issues.map((issue) => ({
    path: issue.path,
    rule: issue.rule,
    fieldId: fieldIdOf(issue.path),
    labelKey: `job.fields.${issue.path}`,
    messageKey: `job.rules.${issue.rule}`,
  }))

/** Pure: the issues of one path, as translation keys of the message. First rule wins when a path has several. */
export const issueKeysByPath = (issues: readonly PublishIssue[]): Readonly<Record<string, string>> =>
  issues.reduce<Record<string, string>>((acc, issue) => (issue.path in acc ? acc : { ...acc, [issue.path]: `job.rules.${issue.rule}` }), {})

const BLOCKED_STAGE_PREFIX = 'stage_has_open_applications:'

/** Pure: ids of the stages the api refused to remove because they still hold open candidates. */
export const blockedStageIds = (issues: readonly { readonly path: string; readonly message: string }[]): ReadonlySet<string> =>
  new Set(issues.filter((issue) => issue.path === 'process' && issue.message.startsWith(BLOCKED_STAGE_PREFIX)).map((issue) => issue.message.slice(BLOCKED_STAGE_PREFIX.length)))
