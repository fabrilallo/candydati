import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import { publicFeedback } from '~~/test/fixtures/phase9-feedback-fixtures'
import FeedbackCvToggle from './FeedbackCvToggle.vue'
import FeedbackForm from './FeedbackForm.vue'
import FeedbackSubmissionView from './FeedbackSubmissionView.vue'

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
const CRITERIA = [{ id: 'k1', label: 'Esperienza con Postgres' }, { id: 'k2', label: 'Inglese B2' }]
const mountForm = async (overrides: Record<string, unknown> = {}) => {
  const wrapper = await mountSuspended(FeedbackForm, { props: { token: 'tok', feedback: publicFeedback(overrides), x }, attachTo: document.body })
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
    expect(wrapper.findAll('textarea').length).toBe(3)
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
    expect(wrapper.find('[data-testid="feedback-issues"]').text()).toContain('domande obbligatorie')
    expect(state.bodies).toEqual([])
  })

  it('selects with the keyboard semantics and sends trimmed answers', async () => {
    const wrapper = await mountForm()
    await wrapper.find('[data-testid="answer-tech_shown"]').setValue('  Postgres solido  ')
    await wrapper.find('[data-testid="answer-tech_open"]').setValue('Sistemi distribuiti')
    await wrapper.find('[data-testid="recommendation-discuss"]').trigger('click')
    expect(wrapper.find('[data-testid="recommendation-discuss"]').attributes('aria-checked')).toBe('true')
    await wrapper.find('[data-testid="recommendation-discuss"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.find('[data-testid="recommendation-proceed"]').attributes('aria-checked')).toBe('true')
    await wrapper.find('[data-testid="feedback-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-done"]').exists()).toBe(true))
    expect(state.bodies).toEqual([{ answers: { tech_shown: 'Postgres solido', tech_open: 'Sistemi distribuiti' }, recommendation: 'proceed', observations: [] }])
    expect(wrapper.text()).toContain('feedback inviato')
  })

  it('emits a failure when the link was used meanwhile, and keeps the form on a server error', async () => {
    const wrapper = await mountForm()
    await wrapper.find('[data-testid="answer-tech_shown"]').setValue('Postgres solido')
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

describe('scorecard in the public form', () => {
  const fillAnswers = async (wrapper: Awaited<ReturnType<typeof mountForm>>) => {
    await wrapper.find('[data-testid="answer-tech_shown"]').setValue('Postgres solido')
    await wrapper.find('[data-testid="answer-tech_open"]').setValue('Sistemi distribuiti')
    await wrapper.find('[data-testid="recommendation-proceed"]').trigger('click')
  }

  it('offers three words per criterion as a radio group, never a number or a scale', async () => {
    const wrapper = await mountForm({ criteria: CRITERIA })
    const group = wrapper.find('[data-testid="observation-k1"] [role="radiogroup"]')
    expect(group.exists()).toBe(true)
    expect(group.findAll('[role="radio"]').map((radio) => radio.text())).toEqual(['Osservato', 'Non osservato', 'Da approfondire'])
    expect(wrapper.find('[data-testid="observation-k1"]').text()).toContain('Esperienza con Postgres')
    expect(wrapper.find('[data-testid="evidence-k2"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="observation-k1"]').text()).not.toMatch(/\d/)
  })

  it('requires a word and the evidence for every criterion', async () => {
    const wrapper = await mountForm({ criteria: CRITERIA })
    await fillAnswers(wrapper)
    await wrapper.find('[data-testid="observation-k1-observed"]').trigger('click')
    await wrapper.find('[data-testid="feedback-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-issues"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="observation-error-k1"]').text()).toContain('Scrivi cosa te lo fa dire')
    expect(wrapper.find('[data-testid="observation-error-k2"]').text()).toContain('Scegli')
    expect(wrapper.find('[data-testid="feedback-issues"]').text()).toContain('criterio')
    expect(state.bodies).toEqual([])
  })

  it('sends one observation per criterion with the evidence', async () => {
    const wrapper = await mountForm({ criteria: CRITERIA })
    await fillAnswers(wrapper)
    await wrapper.find('[data-testid="observation-k1-observed"]').trigger('click')
    await wrapper.find('[data-testid="evidence-k1"]').setValue('  Ha scritto query con CTE e indici  ')
    await wrapper.find('[data-testid="observation-k2-to_explore"]').trigger('click')
    expect(wrapper.find('[data-testid="observation-k2-to_explore"]').attributes('aria-checked')).toBe('true')
    await wrapper.find('[data-testid="evidence-k2"]').setValue('Colloquio in italiano, non verificato')
    await wrapper.find('[data-testid="feedback-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-done"]').exists()).toBe(true))
    expect(state.bodies).toEqual([
      {
        answers: { tech_shown: 'Postgres solido', tech_open: 'Sistemi distribuiti' },
        recommendation: 'proceed',
        observations: [
          { criterionId: 'k1', observation: 'observed', evidence: 'Ha scritto query con CTE e indici' },
          { criterionId: 'k2', observation: 'to_explore', evidence: 'Colloquio in italiano, non verificato' },
        ],
      },
    ])
  })

  it('shows what was sent, read-only, once the link was used', async () => {
    const feedback = publicFeedback({
      criteria: CRITERIA,
      submission: {
        answers: { tech_shown: 'Postgres solido' },
        recommendation: 'discuss',
        observations: [{ criterionId: 'k1', label: 'Esperienza con Postgres', observation: 'not_observed', evidence: 'Non è emerso' }],
        submittedAt: '2026-10-20T10:00:00.000Z',
      },
    })
    const wrapper = await mountSuspended(FeedbackSubmissionView, { props: { feedback, x } })
    mounted.push(wrapper)
    const text = wrapper.text()
    expect(text).toContain('Esperienza con Postgres')
    expect(text).toContain('Non osservato')
    expect(text).toContain('Non è emerso')
    expect(text).toContain('Postgres solido')
    expect(text.toLowerCase()).toContain('parliamone')
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.find('[role="radio"]').exists()).toBe(false)
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
