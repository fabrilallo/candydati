import { CUSTOM_ROLE } from '@candydati/domain'
import type { ResponsibilityRequest } from './job-api'
import type { JobForm } from './job-form'

const blank = (line: string): boolean => line.trim() === ''
/** The role the model reads: the text written by hand when the list had none that fits, else the taxonomy id. */
const roleOf = (form: JobForm): { role: string } | { customRole: string } | Record<string, never> => {
  if (form.role !== CUSTOM_ROLE) return form.role ? { role: form.role } : {}
  return form.customRole.trim() ? { customRole: form.customRole.trim() } : {}
}

/** What the model may see of the form: the ad's own words, never a person. Empty selects are left out. */
export const responsibilityRequestOf = (form: JobForm): ResponsibilityRequest => ({
  ...(form.title.trim() ? { title: form.title.trim() } : {}),
  ...roleOf(form),
  ...(form.seniority ? { seniority: form.seniority } : {}),
  language: form.language || 'it',
  existing: form.responsibilities.filter((line) => !blank(line)),
  summary: form.summary,
})

/** The suggestion button needs something to go on: a title or a role (picked, or written by hand). */
export const canSuggestResponsibilities = (form: JobForm): boolean => Boolean(form.title.trim() || Object.keys(roleOf(form)).length > 0)

/** Adds lines after what is written (empty placeholder rows go), skipping repeats; never rewrites a line. */
export const withResponsibilities = (current: readonly string[], added: readonly string[]): readonly string[] => {
  const kept = current.filter((line) => !blank(line))
  const seen = new Set(kept.map((line) => line.trim().toLowerCase()))
  return [...kept, ...added.filter((line) => !seen.has(line.trim().toLowerCase()) && seen.add(line.trim().toLowerCase()))]
}
