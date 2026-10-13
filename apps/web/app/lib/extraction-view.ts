import type { CvExtraction } from '@tt/domain'
import type { ExtractionDto } from './candidate-schemas'

/**
 * What the profile shows of the automatic CV extraction. Always a suggestion next to the original document, which
 * stays the source of truth (PLAN Fase 2).
 */
export type ExtractionView =
  | { readonly kind: 'pending' }
  | { readonly kind: 'text_only' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'done'; readonly data: CvExtraction; readonly source: 'model' | 'text' | null }

const isEmpty = (data: CvExtraction): boolean =>
  !data.headline && !data.location && data.yearsOfExperience === undefined && [data.experiences, data.education, data.skills, data.languages].every((list) => list.length === 0)

/** Pure: no record yet counts as pending (the extraction job runs after the application is stored). */
export const extractionView = (extraction: ExtractionDto | null): ExtractionView => {
  if (extraction === null || extraction.status === 'pending') return { kind: 'pending' }
  if (extraction.status === 'text_only') return { kind: 'text_only' }
  if (extraction.status === 'failed' || extraction.data === null) return { kind: 'failed' }
  if (isEmpty(extraction.data)) return { kind: 'empty' }
  return { kind: 'done', data: extraction.data, source: extraction.source }
}
