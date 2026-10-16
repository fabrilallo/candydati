import { QUALITY_CATEGORIES, QUALITY_MAX_TOTAL, type AdQualityAssessment, type QualityCategory, type VaguePhrase } from '@candydati/domain'

export type ScoreLevel = 'low' | 'mid' | 'high'

export interface CategoryRow {
  readonly category: QualityCategory
  readonly score: number
  readonly percent: number
  readonly level: ScoreLevel
}

export interface QualityView {
  readonly total: number
  readonly max: number
  readonly threshold: number
  readonly belowThreshold: boolean
  readonly level: ScoreLevel
  readonly rows: readonly CategoryRow[]
  readonly vaguePhrases: readonly VaguePhrase[]
  readonly improvements: readonly string[]
  readonly source: 'rules' | 'model'
}

export const levelOf = (ratio: number): ScoreLevel => (ratio < 0.4 ? 'low' : ratio < 0.7 ? 'mid' : 'high')

/** Pure: everything the quality panel shows, in the canonical category order. */
export const toQualityView = ({ report, threshold, belowThreshold }: AdQualityAssessment): QualityView => ({
  total: report.total,
  max: QUALITY_MAX_TOTAL,
  threshold,
  belowThreshold,
  level: levelOf(report.total / QUALITY_MAX_TOTAL),
  rows: QUALITY_CATEGORIES.map((category) => {
    const score = report.scores[category]
    return { category, score, percent: Math.round(score * 100), level: levelOf(score) }
  }),
  vaguePhrases: report.vaguePhrases,
  improvements: report.improvements,
  source: report.source,
})

/** The score flags, it never blocks: only a known below-threshold result asks for confirmation. */
export const needsConfirmation = (assessment: AdQualityAssessment | null): boolean => assessment?.belowThreshold === true

/** One decimal, locale decimal separator. */
export const formatScore = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale === 'it' ? 'it-IT' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
