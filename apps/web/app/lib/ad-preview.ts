import { CUSTOM_ROLE, employmentSchema, jobContentSchema, locationSchema, salarySchema, selectionStageSchema, type Employment, type JobContent, type SelectionStage } from '@candydati/domain'
import { employmentToInput } from './employment-form'
import type { JobForm, StageForm } from './job-form'

type Schema<T> = { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }

/** The value when the schema accepts it, `undefined` otherwise. */
const valid = <T>(schema: Schema<T>, value: unknown): T | undefined => {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

const number = (value: string): number | undefined => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : undefined)
const text = (value: string): string | undefined => (value.trim() === '' ? undefined : value.trim())
const lines = (items: readonly string[]): string[] => items.map((item) => item.trim()).filter((item) => item !== '')
const defined = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T

const stageOf = (stage: StageForm): SelectionStage | undefined =>
  valid(selectionStageSchema, defined({ title: text(stage.title), type: stage.type, durationMinutes: number(stage.durationMinutes), conductedBy: stage.conductedBy, note: text(stage.note) }))

const shape = jobContentSchema.shape

/** Each employment field on its own: a half-typed amount leaves out that field only. */
const employmentOf = (form: JobForm): Employment | undefined => {
  const raw = employmentToInput(form) ?? {}
  const kept = Object.fromEntries(Object.entries(raw).filter(([key, value]) => employmentSchema.shape[key as keyof Employment]?.safeParse(value).success))
  return Object.keys(kept).length === 0 ? undefined : (kept as Employment)
}

/**
 * Pure: the ad as it would read right now, for the live preview. Lenient where saving is strict: every value that
 * is not valid yet is simply left out (an empty title stays empty), so a half-written draft still renders and the
 * missing parts show up as gaps. Incomplete stages are not shown.
 */
export const formToPreview = (form: JobForm): JobContent => {
  const remote = form.workMode === 'remote'
  const salary = valid(salarySchema, defined({ min: number(form.salaryMin), max: number(form.salaryMax), currency: form.currency, period: form.period }))
  const location = defined({
    country: valid(locationSchema.shape.country, text(form.country)),
    city: remote ? undefined : valid(locationSchema.shape.city, text(form.city)),
    onsiteDaysPerWeek: remote ? undefined : valid(locationSchema.shape.onsiteDaysPerWeek, number(form.onsiteDaysPerWeek)),
  })
  return defined({
    title: form.title.trim(),
    language: valid(shape.language, form.language) ?? 'it',
    role: valid(shape.role, text(form.role)),
    customRole: form.role === CUSTOM_ROLE ? valid(shape.customRole, text(form.customRole)) : undefined,
    seniority: valid(shape.seniority, text(form.seniority)),
    contractType: valid(shape.contractType, text(form.contractType)),
    salary: salary ?? { currency: 'EUR', period: 'year' },
    workMode: valid(shape.workMode, text(form.workMode)),
    location,
    process: form.process.map(stageOf).filter((stage): stage is SelectionStage => stage !== undefined),
    responseDays: valid(shape.responseDays, number(form.responseDays)),
    summary: form.summary.trim(),
    responsibilities: lines(form.responsibilities),
    requirements: { mustHave: lines(form.mustHave), niceToHave: lines(form.niceToHave) },
    technologies: lines(form.technologies),
    benefits: lines(form.benefits),
    growth: form.growth.trim(),
    workLifeBalance: form.workLifeBalance.trim(),
    culture: form.culture.trim(),
    employment: employmentOf(form),
    protectedCategories: valid(shape.protectedCategories, text(form.protectedCategories)),
  }) as JobContent
}
