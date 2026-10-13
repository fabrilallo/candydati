import type { PublishIssue } from '@tt/domain'
import { fieldIdOf } from './job-issues'
import { isComplianceRule } from './phase9-contract'

/** Where a missing §5.1 element shows up in the ad preview. Ordered like the form. */
export const GAP_SLOTS = ['title', 'role', 'seniority', 'contractType', 'salary', 'workMode', 'place', 'process', 'responseDays', 'responsibilities', 'mustHave'] as const
export type GapSlot = (typeof GAP_SLOTS)[number]

const SLOT_OF_PATH: Readonly<Record<string, GapSlot>> = {
  title: 'title',
  role: 'role',
  seniority: 'seniority',
  contractType: 'contractType',
  'salary.min': 'salary',
  'salary.max': 'salary',
  workMode: 'workMode',
  'location.country': 'place',
  'location.city': 'place',
  'location.onsiteDaysPerWeek': 'place',
  process: 'process',
  responseDays: 'responseDays',
  responsibilities: 'responsibilities',
  'requirements.mustHave': 'mustHave',
}

export interface Gap {
  readonly slot: GapSlot
  /** Form control to focus when the gap is clicked. */
  readonly fieldId: string
  /** Translation key (UI language): a plain "missing" sentence, or the rule that fails. */
  readonly messageKey: string
}

export type Gaps = Readonly<Partial<Record<GapSlot, Gap>>>

/** Only one bound of the range missing: name that bound (`Manca la RAL massima`). */
const salaryKey = (issue: PublishIssue, issues: readonly PublishIssue[]): string => {
  const missing = issues.filter((other) => other.rule === 'required' && (other.path === 'salary.min' || other.path === 'salary.max'))
  return missing.length === 1 ? `job.preview.gaps.${issue.path === 'salary.min' ? 'salaryMin' : 'salaryMax'}` : 'job.preview.gaps.salary'
}

const toGap = (slot: GapSlot, issue: PublishIssue, issues: readonly PublishIssue[]): Gap => ({
  slot,
  fieldId: fieldIdOf(issue.path),
  messageKey: issue.rule !== 'required' ? `job.rules.${issue.rule}` : slot === 'salary' ? salaryKey(issue, issues) : `job.preview.gaps.${slot}`,
})

/** Pure: one gap per slot, the first issue of a slot wins (e.g. `salary.min` before `salary.max`). Compliance findings are not gaps: the text is there, it needs fixing (see `compliance-view`). */
export const gapsBySlot = (issues: readonly PublishIssue[]): Gaps =>
  issues.filter((issue) => !isComplianceRule(issue.rule)).reduce<Partial<Record<GapSlot, Gap>>>((acc, issue) => {
    const slot = SLOT_OF_PATH[issue.path]
    return slot === undefined || slot in acc ? acc : { ...acc, [slot]: toGap(slot, issue, issues) }
  }, {})

/** Pure: the gaps in the order of the form, for the readiness menu. */
export const gapList = (issues: readonly PublishIssue[]): readonly Gap[] => {
  const gaps = gapsBySlot(issues)
  return GAP_SLOTS.flatMap((slot) => (gaps[slot] ? [gaps[slot]] : []))
}

/** Optional parts of an ad: hidden when empty in public, a faint hint in the preview. */
export const OPTIONAL_KEYS = ['summary', 'niceToHave', 'technologies', 'benefits', 'growth', 'workLifeBalance', 'culture'] as const
export type OptionalKey = (typeof OPTIONAL_KEYS)[number]

export interface OptionalHint {
  readonly key: OptionalKey
  readonly fieldId: string
  readonly messageKey: string
}

const OPTIONAL_FIELD: Readonly<Record<OptionalKey, string>> = {
  summary: 'job-field-summary',
  niceToHave: 'job-field-requirements-niceToHave',
  technologies: 'job-field-technologies',
  benefits: 'job-field-benefits',
  growth: 'job-field-growth',
  workLifeBalance: 'job-field-workLifeBalance',
  culture: 'job-field-culture',
}

type OptionalContent = Readonly<Record<OptionalKey, string | readonly string[]>>
const isEmpty = (value: string | readonly string[]): boolean => (typeof value === 'string' ? value.trim() === '' : value.length === 0)

/** Pure: the optional sections that are still empty. */
export const optionalHints = (content: OptionalContent): readonly OptionalHint[] =>
  OPTIONAL_KEYS.filter((key) => isEmpty(content[key])).map((key) => ({ key, fieldId: OPTIONAL_FIELD[key], messageKey: `job.preview.optional.${key}` }))

interface VisibleInput {
  readonly issues: readonly PublishIssue[]
  /** Ids of the controls (and list fieldsets) the user has left. */
  readonly touched: ReadonlySet<string>
  /** The user asked to publish or to see what is missing. */
  readonly attempted: boolean
}

/**
 * Pure: which publish rules show on the form fields. A fresh draft is not a wall of red: a rule appears once the
 * field has been left or after a publish attempt. A max below the min is a contradiction and shows at once.
 */
export const visibleIssueErrors = ({ issues, touched, attempted }: VisibleInput): Readonly<Record<string, string>> =>
  issues.reduce<Record<string, string>>((acc, issue) => {
    const shown = attempted || issue.rule === 'salary_max_below_min' || touched.has(fieldIdOf(issue.path))
    return !shown || issue.path in acc ? acc : { ...acc, [issue.path]: `job.rules.${issue.rule}` }
  }, {})
