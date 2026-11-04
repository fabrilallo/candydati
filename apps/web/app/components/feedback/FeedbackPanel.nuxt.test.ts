import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detail } from '~~/test/fixtures/candidate-fixtures'
import { ok } from '~~/test/fixtures/job-fixtures'
import { applicationFeedback } from '~~/test/fixtures/phase9-feedback-fixtures'
import FeedbackPanel from './FeedbackPanel.vue'

const state = vi.hoisted(() => ({ value: null as unknown, bodies: [] as unknown[] }))
registerEndpoint('/api/v1/applications/a1/feedback', { method: 'GET', handler: () => ok(state.value) })
registerEndpoint('/api/v1/applications/a1/feedback/request', {
  method: 'POST',
  handler: async (event) => {
    state.bodies.push(await readBody(event))
    return ok({ requested: 1 })
  },
})

const mounted: { unmount: () => void }[] = []
const mountPanel = async (canManage = true) => {
  const wrapper = await mountSuspended(FeedbackPanel, { props: { application: detail().applications[0]!, canManage }, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
beforeEach(() => {
  state.value = applicationFeedback()
  state.bodies = []
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('Feedback tab', () => {
  it('groups requests and shows submitted feedback with the opinion clearly labelled', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-group-overdue"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="feedback-group-overdue"]').text()).toContain('Luca Bianchi')
    expect(wrapper.find('[data-testid="feedback-group-pending"]').text()).toContain('Marta Esterna')
    expect(wrapper.find('[data-testid="feedback-group-pending"]').text()).toContain('Colloquio finale')
    const item = wrapper.find('[data-testid="feedback-item"]')
    expect(item.text()).toContain('Ottima conoscenza di Postgres.')
    expect(item.find('[data-testid="feedback-opinion"]').text()).toContain('Indicazione: proseguire')
    expect(item.find('[data-testid="feedback-opinion"]').text()).toContain('non una decisione')
  })

  it('puts a lock on the requests and feedback of a restricted stage, and only there', async () => {
    state.value = { ...applicationFeedback(), restrictedStageIds: ['stage-0'] }
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-item"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="feedback-group-overdue"] [data-testid="feedback-restricted"]').text()).toContain('Fase riservata')
    expect(wrapper.find('[data-testid="feedback-group-pending"] [data-testid="feedback-restricted"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feedback-item"] [data-testid="feedback-restricted"]').exists()).toBe(true)
  })

  it('shows no lock when no stage is restricted', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-item"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="feedback-restricted"]').exists()).toBe(false)
  })

  it('shows the scorecard: criteria as rows, each interviewer\'s word and evidence side by side, no total', async () => {
    const entry = (feedbackId: string, interviewerName: string, observation: string, evidence: string) => ({ feedbackId, interviewerName, stageId: 'stage-0', stageLabel: 'Colloquio tecnico', observation, evidence, submittedAt: '2026-10-03T10:00:00.000Z' })
    state.value = {
      ...applicationFeedback(),
      scorecard: [
        { criterionId: 'k1', label: 'Esperienza con Postgres', entries: [entry('f1', 'Luca Bianchi', 'observed', 'Query con CTE'), entry('f2', 'Marta Esterna', 'to_explore', 'Solo teoria')] },
        { criterionId: 'k2', label: 'Inglese B2', entries: [] },
      ],
    }
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="scorecard"]').exists()).toBe(true))
    const rows = wrapper.findAll('[data-testid="scorecard-row"]')
    expect(rows.map((row) => row.find('[data-testid="scorecard-criterion"]').text())).toEqual(['Esperienza con Postgres', 'Inglese B2'])
    const entries = rows[0]!.findAll('[data-testid="scorecard-entry"]')
    expect(entries.map((item) => item.text())).toEqual([expect.stringContaining('Luca Bianchi'), expect.stringContaining('Marta Esterna')])
    expect(entries[0]!.text()).toContain('Osservato')
    expect(entries[0]!.text()).toContain('Query con CTE')
    expect(entries[1]!.text()).toContain('Da approfondire')
    expect(rows[1]!.find('[data-testid="scorecard-none"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="scorecard"]').text()).not.toMatch(/\d+\s*(su|di|of|\/)\s*\d+/i)
  })

  it('shows the observations inside a submitted feedback', async () => {
    const base = applicationFeedback()
    state.value = { ...base, feedback: base.feedback.map((item) => ({ ...item, observations: [{ criterionId: 'k1', label: 'Esperienza con Postgres', observation: 'not_observed', evidence: 'Non emerso' }] })) }
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-item"] [data-testid="observation-item"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="feedback-item"]').text()).toContain('Non osservato')
    expect(wrapper.find('[data-testid="scorecard"]').exists()).toBe(false)
  })

  it('shows an empty state', async () => {
    state.value = { requests: [], feedback: [] }
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-empty"]').exists()).toBe(true))
  })

  it('hides the action without feedback:manage', async () => {
    const wrapper = await mountPanel(false)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-group-overdue"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="feedback-ask"]').exists()).toBe(false)
  })

  it('asks for feedback on the current stage by default, then for an external person', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-ask"]').exists()).toBe(true))
    await wrapper.find('[data-testid="feedback-ask"]').trigger('click')
    const field = (id: string) => document.body.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-testid="${id}"]`)!
    await vi.waitFor(() => expect(field('feedback-request-stage')).toBeTruthy())
    expect(field('feedback-request-stage').value).toBe('stage-0')
    const form = document.body.querySelector('[data-testid="feedback-request-form"]')!
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(state.bodies).toEqual([{ stageId: 'stage-0' }]))
  })

  it('validates the external person before sending', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-ask"]').exists()).toBe(true))
    await wrapper.find('[data-testid="feedback-ask"]').trigger('click')
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="feedback-request-external"]')).toBeTruthy())
    const box = document.body.querySelector<HTMLInputElement>('[data-testid="feedback-request-external"]')!
    box.click()
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="feedback-request-email"]')).toBeTruthy())
    document.body.querySelector('[data-testid="feedback-request-form"]')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(document.body.textContent).toContain('Scrivi un indirizzo email valido.'))
    expect(state.bodies).toEqual([])
  })
})
