import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { QUALITY_CATEGORIES, type AdQualityAssessment } from '@candydati/domain'
import { describe, expect, it, vi } from 'vitest'
import { instanceAi } from '~~/test/fixtures/instance-ai-fixtures'
import { toQualityView } from '@/lib/quality-view'
import QualityPanel from './QualityPanel.vue'

const assessment: AdQualityAssessment = {
  report: {
    scores: Object.fromEntries(QUALITY_CATEGORIES.map((category) => [category, 0.5])) as never,
    total: 5,
    vaguePhrases: [{ text: 'stipendio competitivo', category: 'salary_transparency', suggestion: 'Indica la fascia di RAL' }],
    improvements: ['Descrivi i benefit'],
    source: 'model',
  },
  threshold: 6,
  belowThreshold: true,
}
const base = { view: null, pending: false, stale: false, errorKey: null }
const ai = vi.hoisted(() => ({ settings: null as unknown }))
registerEndpoint('/api/v1/instance/ai-settings', { method: 'GET', handler: () => ({ success: true, data: ai.settings, error: null }) })
const mountOff = async (canManage: boolean) => {
  ai.settings = instanceAi({ canManage })
  clearNuxtData('instance-ai-settings')
  return mountSuspended(QualityPanel, { props: { ...base, unavailable: true } })
}

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

  it('opens the advice by default and lets the author fold it away', async () => {
    const wrapper = await mountSuspended(QualityPanel, { props: { ...base, view: toQualityView(assessment) } })
    const toggle = wrapper.find('[aria-controls]')
    const details = () => wrapper.find(`[id="${toggle.attributes('aria-controls')}"]`)
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(details().attributes('style') ?? '').not.toContain('display: none')
    expect(details().find('[data-testid="improvements"]').exists()).toBe(true)
    expect(details().find('[data-testid="vague-phrase"]').exists()).toBe(true)
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(details().attributes('style')).toContain('display: none')
  })

  it('without a model shows no score, says AI is needed and links the AI settings for whoever may change them', async () => {
    const wrapper = await mountOff(true)
    expect(wrapper.find('[data-testid="quality-total"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="quality-ai-off"]').text()).toContain("richiede l'AI")
    await vi.waitFor(() => expect(wrapper.find('[data-testid="quality-ai-settings"]').attributes('href')).toBe('/app/settings/ai'))
    expect(wrapper.find('[data-testid="quality-ai-settings"]').text()).toContain('Impostazioni > AI')
    expect(wrapper.find('[data-testid="analyze"]').exists()).toBe(true)
  })

  it('without a model tells everyone else to ask whoever runs the installation', async () => {
    const wrapper = await mountOff(false)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="quality-ai-ask"]').text()).toContain('chiedi a chi amministra'))
    expect(wrapper.find('[data-testid="quality-ai-settings"]').exists()).toBe(false)
  })

  it('flags a stale result, disables the button while pending and shows errors', async () => {
    const wrapper = await mountSuspended(QualityPanel, { props: { view: toQualityView(assessment), pending: true, stale: true, errorKey: 'errors.unreachable' } })
    expect(wrapper.find('[data-testid="quality-stale"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="analyze"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[role="alert"]').text()).toContain('non è raggiungibile')
  })
})
