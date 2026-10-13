import type { AdQualityAssessment } from '@tt/domain'
import { QUALITY_CATEGORIES } from '@tt/domain'
import { describe, expect, it } from 'vitest'
import { formatScore, levelOf, needsConfirmation, toQualityView } from './quality-view'

const assessment = (below: boolean): AdQualityAssessment => ({
  report: {
    scores: Object.fromEntries(QUALITY_CATEGORIES.map((c, i) => [c, i / 10])) as never,
    total: 4.5,
    vaguePhrases: [{ text: 'stipendio competitivo', category: 'salary_transparency', suggestion: 'Indica la fascia' }],
    improvements: ['Aggiungi i benefit'],
    source: 'rules',
  },
  threshold: 6,
  belowThreshold: below,
})

describe('toQualityView', () => {
  it('lists the ten categories in canonical order with percent and level', () => {
    const view = toQualityView(assessment(true))
    expect(view.rows.map((r) => r.category)).toEqual([...QUALITY_CATEGORIES])
    expect(view.rows[0]).toMatchObject({ score: 0, percent: 0, level: 'low' })
    expect(view.rows[9]).toMatchObject({ percent: 90, level: 'high' })
    expect(view.rows[5]).toMatchObject({ percent: 50, level: 'mid' })
    expect(view).toMatchObject({ total: 4.5, max: 10, threshold: 6, belowThreshold: true, level: 'mid', source: 'rules' })
    expect(view.vaguePhrases[0]?.suggestion).toBe('Indica la fascia')
    expect(view.improvements).toEqual(['Aggiungi i benefit'])
  })
})

describe('levels and confirmation', () => {
  it('buckets ratios', () => {
    expect([0.1, 0.4, 0.69, 0.7, 1].map(levelOf)).toEqual(['low', 'mid', 'mid', 'high', 'high'])
  })

  it('asks for confirmation only when below threshold', () => {
    expect(needsConfirmation(assessment(true))).toBe(true)
    expect(needsConfirmation(assessment(false))).toBe(false)
    expect(needsConfirmation(null)).toBe(false)
  })

  it('formats with the locale separator', () => {
    expect(formatScore(7, 'it')).toBe('7,0')
    expect(formatScore(7.5, 'en')).toBe('7.5')
  })
})
