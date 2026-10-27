import type { ResponsibilityRequest } from './job-api'
import type { JobForm } from './job-form'

const blank = (line: string): boolean => line.trim() === ''

/** What the model may see of the form: the ad's own words, never a person. Empty selects are left out. */
export const responsibilityRequestOf = (form: JobForm): ResponsibilityRequest => ({
  ...(form.title.trim() ? { title: form.title.trim() } : {}),
  ...(form.role ? { role: form.role } : {}),
  ...(form.seniority ? { seniority: form.seniority } : {}),
  language: form.language || 'it',
  existing: form.responsibilities.filter((line) => !blank(line)),
  summary: form.summary,
})

/** The suggestion button needs something to go on: a title or a role. */
export const canSuggestResponsibilities = (form: JobForm): boolean => Boolean(form.title.trim() || form.role)

/** Adds lines after what is written (empty placeholder rows go), skipping repeats; never rewrites a line. */
export const withResponsibilities = (current: readonly string[], added: readonly string[]): readonly string[] => {
  const kept = current.filter((line) => !blank(line))
  const seen = new Set(kept.map((line) => line.trim().toLowerCase()))
  return [...kept, ...added.filter((line) => !seen.has(line.trim().toLowerCase()) && seen.add(line.trim().toLowerCase()))]
}
