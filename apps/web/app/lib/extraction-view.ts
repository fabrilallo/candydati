import { normalizeSkill, type CvExtraction, type ExtractionDto } from '@candydati/domain'

/**
 * What the profile shows of the automatic CV extraction. Always a suggestion next to the original document, which
 * stays the source of truth (PRODUCT.md §3.1).
 */
export type ExtractionView =
  | { readonly kind: 'pending' }
  | { readonly kind: 'text_only' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'done'; readonly data: CvExtraction; readonly source: 'model' | 'text' | null; readonly skills: readonly SkillView[] }

/** A skill of the CV as shown: the organization's name for it, plus the written forms that differ from that name. */
export interface SkillView {
  readonly label: string
  readonly writtenAs: readonly string[]
}

/** Canonical name first, else the first written form; first-appearance order is kept, never an order of merit. */
export const skillViews = (extraction: ExtractionDto): readonly SkillView[] => {
  const grouped = extraction.skills.length > 0 ? extraction.skills : (extraction.data?.skills ?? []).map((skill) => ({ canonical: null, writtenAs: [skill] }))
  return grouped.flatMap(({ canonical, writtenAs }) => {
    const label = canonical ?? writtenAs[0]
    if (label === undefined) return []
    return [{ label, writtenAs: writtenAs.filter((form) => normalizeSkill(form) !== normalizeSkill(label)) }]
  })
}

const isEmpty = (data: CvExtraction): boolean =>
  !data.headline && !data.location && data.yearsOfExperience === undefined && [data.experiences, data.education, data.skills, data.languages].every((list) => list.length === 0)

/** Pure: no record yet counts as pending (the extraction job runs after the application is stored). */
export const extractionView = (extraction: ExtractionDto | null): ExtractionView => {
  if (extraction === null || extraction.status === 'pending') return { kind: 'pending' }
  if (extraction.status === 'text_only') return { kind: 'text_only' }
  if (extraction.status === 'failed' || extraction.data === null) return { kind: 'failed' }
  if (isEmpty(extraction.data)) return { kind: 'empty' }
  return { kind: 'done', data: extraction.data, source: extraction.source, skills: skillViews(extraction) }
}
