import { mountSuspended } from '@nuxt/test-utils/runtime'
import { QUALITY_CATEGORIES, type AdQualityAssessment } from '@tt/domain'
import { describe, expect, it } from 'vitest'
import { toQualityView } from '@/lib/quality-view'
import QualityPanel from './QualityPanel.vue'

const assessment: AdQualityAssessment = {
  report: {
    scores: Object.fromEntries(QUALITY_CATEGORIES.map((category) => [category, 0.5])) as never,
    total: 5,
    vaguePhrases: [{ text: 'stipendio competitivo', category: 'salary_transparency', suggestion: 'Indica la fascia di RAL' }],
    improvements: ['Descrivi i benefit'],
    source: 'rules',
  },
  threshold: 6,
  belowThreshold: true,
}
const base = { view: null, pending: false, stale: false, errorKey: null }

describe('QualityPanel', () => {
  it('explains that the analysis runs on demand and asks for it', async () => {
    const wrapper = await mountSuspended(QualityPanel, { props: base })
    expect(wrapper.text()).toContain('non gira a ogni tasto')
    await wrapper.find('[data-testid="analyze"]').trigger('click')
    expect(wrapper.emitted('analyze')).toHaveLength(1)
    expect(wrapper.find('[data-testid="analyze"]').text()).toBe('Analizza annuncio')
  })

  it('shows the total, the ten categories, vague phrases with rewrite and improvements', async () => {
    const wrapper = await mountSuspended(QualityPanel, { props: { ...base, view: toQualityView(assessment) } })
    expect(wrapper.find('[data-testid="quality-total"]').text()).toContain('5,0')
    expect(wrapper.find('[data-testid="quality-total"]').text()).toContain('su 10')
    expect(wrapper.findAll('[data-testid="quality-category"]')).toHaveLength(10)
    expect(wrapper.find('[data-testid="quality-category"] [role="meter"]').attributes('aria-valuenow')).toBe('0.5')
    expect(wrapper.find('[data-testid="vague-phrase"]').text()).toContain('stipendio competitivo')
    expect(wrapper.find('[data-testid="vague-phrase"]').text()).toContain('Indica la fascia di RAL')
    expect(wrapper.find('[data-testid="improvements"]').text()).toContain('Descrivi i benefit')
    expect(wrapper.text()).toContain('Sotto la soglia consigliata')
    expect(wrapper.find('[data-testid="analyze"]').text()).toBe('Analizza di nuovo')
  })

  it('flags a stale result, disables the button while pending and shows errors', async () => {
    const wrapper = await mountSuspended(QualityPanel, { props: { view: toQualityView(assessment), pending: true, stale: true, errorKey: 'errors.unreachable' } })
    expect(wrapper.find('[data-testid="quality-stale"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="analyze"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[role="alert"]').text()).toContain('non è raggiungibile')
  })
})
