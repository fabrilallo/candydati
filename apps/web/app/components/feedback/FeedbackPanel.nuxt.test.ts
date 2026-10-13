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
