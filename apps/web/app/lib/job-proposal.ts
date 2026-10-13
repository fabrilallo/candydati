import type { JobContent } from '@tt/domain'
import { contentToForm, type JobForm, type StageForm } from './job-form'

/**
 * "Applica alla bozza": an ad proposed by the assistant (`draft_job_content`) poured into the editor form. Nothing
 * is saved: the person reviews and saves. What the proposal leaves empty keeps the current value; a saved stage
 * keeps its id only when the proposal has a stage of the same type at the same place (candidates hang on ids).
 */
const isEmpty = (value: unknown): boolean => value === '' || (Array.isArray(value) && value.length === 0)

const withStageIds = (current: readonly StageForm[], proposed: readonly StageForm[]): readonly StageForm[] =>
  proposed.map((stage, index) => {
    const saved = current[index]
    return saved && saved.id !== '' && saved.type === stage.type ? { ...stage, id: saved.id } : stage
  })

export const applyJobProposal = (form: JobForm, content: JobContent): JobForm => {
  const proposed = contentToForm(content)
  const merged = Object.fromEntries(
    (Object.keys(proposed) as (keyof JobForm)[]).map((key) => [key, isEmpty(proposed[key]) ? form[key] : proposed[key]]),
  ) as unknown as JobForm
  return content.process.length > 0 ? { ...merged, process: withStageIds(form.process, proposed.process) } : merged
}

export interface ProposalFacts {
  readonly title: string
  readonly salary: { readonly min: number | null; readonly max: number | null; readonly currency: string; readonly period: string } | null
  readonly city: string | null
  readonly stages: number
  readonly responsibilities: number
}

/** What the proposal card shows before it is applied. */
export const proposalFacts = (content: JobContent): ProposalFacts => {
  const { min, max, currency, period } = content.salary
  return {
    title: content.title,
    salary: min === undefined && max === undefined ? null : { min: min ?? null, max: max ?? null, currency, period },
    city: content.location.city ?? null,
    stages: content.process.length,
    responsibilities: content.responsibilities.length,
  }
}
