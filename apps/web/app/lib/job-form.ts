import { CUSTOM_ROLE, checkCompliance, checkPublishable, jobContentSchema, type ComplianceIssue, type JobContent, type PublishIssue, type SelectionStage } from '@candydati/domain'
import { emptyEmployment, employmentToForm, employmentToInput, type EmploymentForm } from './employment-form'

/** One stage as typed in the editor: numbers stay strings until the form is turned into content. */
export interface StageForm {
  /** Stable id given by the server. Empty for a stage that was never saved: the server assigns it. */
  readonly id: string
  /** Optional free title; empty means "show the type". */
  readonly title: string
  readonly type: string
  readonly durationMinutes: string
  readonly conductedBy: string
  readonly note: string
}

/** Editor state. Flat on purpose: every update is `{ ...form, ...patch }`, never a mutation. */
export interface JobForm extends EmploymentForm {
  readonly title: string
  readonly language: string
  readonly role: string
  /** Text of the role when `role` is `other`. */
  readonly customRole: string
  readonly seniority: string
  readonly contractType: string
  readonly salaryMin: string
  readonly salaryMax: string
  readonly currency: string
  readonly period: string
  readonly workMode: string
  readonly country: string
  readonly city: string
  readonly onsiteDaysPerWeek: string
  readonly process: readonly StageForm[]
  readonly responseDays: string
  readonly summary: string
  readonly responsibilities: readonly string[]
  readonly mustHave: readonly string[]
  readonly niceToHave: readonly string[]
  readonly technologies: readonly string[]
  readonly benefits: readonly string[]
  readonly growth: string
  readonly workLifeBalance: string
  readonly culture: string
  /** `none`, `reserved`, `also` (L. 68/99), or empty when the ad does not say. */
  readonly protectedCategories: string
}

export const emptyStage = (): StageForm => ({ id: '', title: '', type: '', durationMinutes: '', conductedBy: '', note: '' })

export const emptyForm = (language: string = 'it'): JobForm => ({
  title: '',
  language,
  role: '',
  customRole: '',
  seniority: '',
  contractType: '',
  salaryMin: '',
  salaryMax: '',
  currency: 'EUR',
  period: 'year',
  workMode: '',
  country: '',
  city: '',
  onsiteDaysPerWeek: '',
  process: [],
  responseDays: '',
  summary: '',
  responsibilities: [],
  mustHave: [],
  niceToHave: [],
  technologies: [],
  benefits: [],
  growth: '',
  workLifeBalance: '',
  culture: '',
  protectedCategories: '',
  ...emptyEmployment(),
})

const str = (value: string | number | undefined): string => (value === undefined ? '' : String(value))

const stageToForm = (stage: SelectionStage): StageForm => ({
  id: stage.id ?? '',
  title: stage.title ?? '',
  type: stage.type,
  durationMinutes: str(stage.durationMinutes),
  conductedBy: stage.conductedBy,
  note: stage.note ?? '',
})

export const contentToForm = (content: JobContent): JobForm => ({
  title: content.title,
  language: content.language,
  role: content.role ?? '',
  customRole: content.customRole ?? '',
  seniority: content.seniority ?? '',
  contractType: content.contractType ?? '',
  salaryMin: str(content.salary.min),
  salaryMax: str(content.salary.max),
  currency: content.salary.currency,
  period: content.salary.period,
  workMode: content.workMode ?? '',
  country: content.location.country ?? '',
  city: content.location.city ?? '',
  onsiteDaysPerWeek: str(content.location.onsiteDaysPerWeek),
  process: content.process.map(stageToForm),
  responseDays: str(content.responseDays),
  summary: content.summary,
  responsibilities: content.responsibilities,
  mustHave: content.requirements.mustHave,
  niceToHave: content.requirements.niceToHave,
  technologies: content.technologies,
  benefits: content.benefits,
  growth: content.growth,
  workLifeBalance: content.workLifeBalance,
  culture: content.culture,
  protectedCategories: content.protectedCategories ?? '',
  ...employmentToForm(content.employment),
})

const optional = (value: string): string | undefined => {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}
/** Empty -> undefined; anything else becomes a number (NaN and decimals are left for the schema to reject). */
const optionalNumber = (value: string): number | undefined => {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : Number(trimmed)
}
const cleanLines = (items: readonly string[]): string[] => items.map((item) => item.trim()).filter((item) => item !== '')

const STAGE_FIELDS = ['type', 'durationMinutes', 'conductedBy'] as const
const isBlankStage = (stage: StageForm): boolean => STAGE_FIELDS.every((field) => stage[field].trim() === '') && stage.note.trim() === '' && stage.title.trim() === ''
/** Complete means: the three required fields are filled. */
export const isCompleteStage = (stage: StageForm): boolean => STAGE_FIELDS.every((field) => stage[field].trim() !== '')

const stageToInput = (stage: StageForm): Record<string, unknown> => ({
  ...(stage.id === '' ? {} : { id: stage.id }),
  ...(optional(stage.title) === undefined ? {} : { title: optional(stage.title) }),
  type: stage.type,
  durationMinutes: optionalNumber(stage.durationMinutes),
  conductedBy: stage.conductedBy,
  ...(optional(stage.note) === undefined ? {} : { note: optional(stage.note) }),
})

/** Raw object handed to `jobContentSchema`. Incomplete stages are kept so the schema reports them. */
export const formToInput = (form: JobForm): Record<string, unknown> => {
  const remote = form.workMode === 'remote'
  return {
    title: form.title,
    language: form.language,
    role: optional(form.role),
    customRole: form.role === CUSTOM_ROLE ? optional(form.customRole) : undefined,
    seniority: optional(form.seniority),
    contractType: optional(form.contractType),
    salary: { min: optionalNumber(form.salaryMin), max: optionalNumber(form.salaryMax), currency: form.currency, period: form.period },
    workMode: optional(form.workMode),
    location: {
      country: optional(form.country),
      city: remote ? undefined : optional(form.city),
      onsiteDaysPerWeek: remote ? undefined : optionalNumber(form.onsiteDaysPerWeek),
    },
    process: form.process.filter((stage) => !isBlankStage(stage)).map(stageToInput),
    responseDays: optionalNumber(form.responseDays),
    summary: form.summary,
    responsibilities: cleanLines(form.responsibilities),
    requirements: { mustHave: cleanLines(form.mustHave), niceToHave: cleanLines(form.niceToHave) },
    technologies: cleanLines(form.technologies),
    benefits: cleanLines(form.benefits),
    growth: form.growth,
    workLifeBalance: form.workLifeBalance,
    culture: form.culture,
    employment: employmentToInput(form),
    protectedCategories: optional(form.protectedCategories),
  }
}

/**
 * Pure: the form with the stage ids the server assigned. `saved` holds the stages that were sent, in order (blank
 * rows are not sent, so they are skipped); a stage that already has an id keeps it.
 */
export const adoptStageIds = (form: JobForm, saved: JobContent): JobForm => {
  let next = 0
  const process = form.process.map((stage) => {
    if (isBlankStage(stage)) return stage
    const assigned = saved.process[next]?.id
    next += 1
    return stage.id === '' && assigned !== undefined ? { ...stage, id: assigned } : stage
  })
  return { ...form, process }
}

export type FieldErrors = Readonly<Record<string, string>>

export type FormValidation =
  | { readonly content: JobContent; readonly errors: Readonly<Record<string, never>> }
  | { readonly content: null; readonly errors: FieldErrors }

const issueKey = (code: string, path: string): string => {
  if (path === 'title') return 'validation.required'
  return code === 'invalid_value' ? 'job.validation.invalidChoice' : 'job.validation.invalidValue'
}

/** `employment.mealVoucher.amountPerDay` is shown on the amount field (`employment.mealVoucher`). */
const employmentPath = (path: readonly string[]): string => (path[0] === 'employment' ? path.slice(0, 2).join('.') : path.join('.'))

/** Pure: the content the form describes, or the first translation key per field path. */
export const validateForm = (form: JobForm): FormValidation => {
  const parsed = jobContentSchema.safeParse(formToInput(form))
  if (parsed.success) return { content: parsed.data, errors: {} }
  const errors = parsed.error.issues.reduce<Record<string, string>>((acc, issue) => {
    const path = issue.path.length > 1 && issue.path[0] === 'process' ? 'process' : employmentPath(issue.path.map(String))
    const key = path === 'process' ? 'job.validation.stageIncomplete' : issueKey(issue.code, path)
    return path in acc ? acc : { ...acc, [path]: key }
  }, {})
  return { content: null, errors }
}

// --- immutable list helpers -------------------------------------------------------------------------------

export const appendItem = <T>(items: readonly T[], item: T): readonly T[] => [...items, item]
/** Inserts at `index` (clamped to the end). */
export const insertItem = <T>(items: readonly T[], index: number, item: T): readonly T[] => [...items.slice(0, index), item, ...items.slice(index)]
export const removeItem = <T>(items: readonly T[], index: number): readonly T[] => items.filter((_, i) => i !== index)
export const replaceItem = <T>(items: readonly T[], index: number, item: T): readonly T[] => items.map((current, i) => (i === index ? item : current))
/** Swaps the item with its neighbour; out-of-range moves return the same list. */
export const moveItem = <T>(items: readonly T[], index: number, delta: -1 | 1): readonly T[] => {
  const target = index + delta
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items
  return items.map((current, i) => (i === index ? (items[target] as T) : i === target ? (items[index] as T) : current))
}

/** Stable snapshot used to know whether the form differs from what was last saved. */
export const snapshotOf = (form: JobForm): string => JSON.stringify(form)

export interface PublishCheck {
  readonly issues: readonly PublishIssue[]
  /** Problems that stop even a draft from being saved (empty title, malformed numbers, incomplete stages). */
  readonly errors: FieldErrors
  /** Nothing blocks publication: every §5.1 rule holds and the form is well formed. */
  readonly publishable: boolean
  /** Doubtful compliance findings ("Da rivedere"): shown, never blocking. */
  readonly warnings: readonly ComplianceIssue[]
}

/**
 * Pure, local, instant: what is missing to publish this form, computed with `checkPublishable` from the domain
 * (no api call). Incomplete stages do not count as stages; an empty title is reported as a missing field.
 */
export const checkForm = (form: JobForm): PublishCheck => {
  const { errors } = validateForm(form)
  const lenient = validateForm({ ...form, title: form.title.trim() === '' ? '-' : form.title, process: form.process.filter(isCompleteStage) })
  const rules = lenient.content ? checkPublishable(lenient.content) : []
  const issues: readonly PublishIssue[] = form.title.trim() === '' ? [{ path: 'title', rule: 'required' }, ...rules] : rules
  const warnings = lenient.content ? checkCompliance(lenient.content).warnings : []
  return { issues, errors, publishable: issues.length === 0 && Object.keys(errors).length === 0, warnings }
}
