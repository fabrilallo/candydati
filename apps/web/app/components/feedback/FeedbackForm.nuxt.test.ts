import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import { publicFeedback } from '~~/test/fixtures/phase9-feedback-fixtures'
import FeedbackCvToggle from './FeedbackCvToggle.vue'
import FeedbackForm from './FeedbackForm.vue'

const state = vi.hoisted(() => ({ bodies: [] as unknown[], status: 200 }))
registerEndpoint('/api/v1/public/feedback/tok', {
  method: 'POST',
  handler: async (event) => {
    state.bodies.push(await readBody(event))
    if (state.status !== 200) {
      setResponseStatus(event, state.status)
      return { success: false, data: null, error: { code: 'x', message: 'x' } }
    }
    return ok({ submitted: true })
  },
})

const mounted: { unmount: () => void }[] = []
const x = (key: string, params: Record<string, unknown> = {}) => useNuxtApp().$i18n.t(key, params)
const mountForm = async () => {
  const wrapper = await mountSuspended(FeedbackForm, { props: { token: 'tok', feedback: publicFeedback(), x }, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  state.bodies = []
  state.status = 200
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('public feedback form', () => {
  it('shows the questions, three radio choices and no score', async () => {
    const wrapper = await mountForm()
    expect(wrapper.findAll('textarea').length).toBe(2)
    expect(wrapper.text()).toContain('Fatti, non impressioni.')
    expect(wrapper.text()).toContain('La tua indicazione per la prossima fase')
    expect(wrapper.text()).toContain('non una decisione')
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios.map((radio) => radio.text())).toEqual(['Proseguire', 'Non proseguire', 'Parliamone'])
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(true)
    expect(wrapper.text().toLowerCase()).not.toMatch(/punteggio|score|stell/)
  })

  it('refuses to send without recommendation and answers', async () => {
    const wrapper = await mountForm()
    await wrapper.find('[data-testid="feedback-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-issues"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="feedback-issues"]').text()).toContain('Scegli un')
    expect(wrapper.find('[data-testid="feedback-issues"]').text()).toContain('almeno una risposta')
    expect(state.bodies).toEqual([])
  })

  it('selects with the keyboard semantics and sends trimmed answers', async () => {
    const wrapper = await mountForm()
    await wrapper.find('[data-testid="answer-tech_shown"]').setValue('  Postgres solido  ')
    await wrapper.find('[data-testid="recommendation-discuss"]').trigger('click')
    expect(wrapper.find('[data-testid="recommendation-discuss"]').attributes('aria-checked')).toBe('true')
    await wrapper.find('[data-testid="recommendation-discuss"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.find('[data-testid="recommendation-proceed"]').attributes('aria-checked')).toBe('true')
    await wrapper.find('[data-testid="feedback-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-done"]').exists()).toBe(true))
    expect(state.bodies).toEqual([{ answers: { tech_shown: 'Postgres solido' }, recommendation: 'proceed' }])
    expect(wrapper.text()).toContain('feedback inviato')
  })

  it('emits a failure when the link was used meanwhile, and keeps the form on a server error', async () => {
    const wrapper = await mountForm()
    await wrapper.find('[data-testid="answer-tech_open"]').setValue('Sistemi distribuiti')
    await wrapper.find('[data-testid="recommendation-proceed"]').trigger('click')
    state.status = 409
    await wrapper.find('[data-testid="feedback-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('failed')).toEqual([['used']]))
    state.status = 500
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await wrapper.find('[data-testid="feedback-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-issues"]').text()).toContain('Non riusciamo'))
    expect(wrapper.find('[data-testid="feedback-form"]').exists()).toBe(true)
    spy.mockRestore()
  })
})

describe('cv toggle', () => {
  it('loads the token-scoped pdf only when opened', async () => {
    const wrapper = await mountSuspended(FeedbackCvToggle, { props: { token: 'tok', name: 'Giulia Rossi', x }, attachTo: document.body })
    mounted.push(wrapper)
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.text()).toContain('Vedi il CV')
    await wrapper.find('[data-testid="feedback-cv-toggle"]').trigger('click')
    expect(wrapper.find('iframe').attributes('src')).toBe('/api/v1/public/feedback/tok/cv')
    expect(wrapper.find('[data-testid="feedback-cv-toggle"]').attributes('aria-expanded')).toBe('true')
  })
})
