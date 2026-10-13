import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import { publicFeedback } from '~~/test/fixtures/phase9-feedback-fixtures'
import Page from './[token].vue'

const state = vi.hoisted(() => ({ status: 200, body: null as unknown }))
for (const token of ['good', 'bad']) {
  registerEndpoint(`/api/v1/public/feedback/${token}`, {
    method: 'GET',
    handler: (event) => {
      if (token === 'bad' || state.status !== 200) {
        setResponseStatus(event, state.status === 200 ? 410 : state.status)
        return { success: false, data: null, error: { code: 'expired', message: 'x' } }
      }
      return ok(state.body)
    },
  })
}

const mounted: { unmount: () => void }[] = []
const mountPage = async (token: string) => {
  const wrapper = await mountSuspended(Page, { route: `/feedback/${token}`, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
beforeEach(() => {
  state.status = 200
  state.body = publicFeedback()
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('public feedback page', () => {
  it('shows only what the interviewer needs, the form and the CV toggle', async () => {
    const wrapper = await mountPage('good')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-page"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="feedback-candidate"]').text()).toBe('Giulia Rossi')
    expect(wrapper.find('[data-testid="feedback-job"]').text()).toBe('Backend developer')
    expect(wrapper.find('[data-testid="feedback-stage"]').text()).toBe('Colloquio tecnico')
    expect(wrapper.find('[data-testid="feedback-stage-note"]').text()).toBe('Pair programming di 45 minuti.')
    expect(wrapper.find('[data-testid="feedback-cv-toggle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="feedback-form"]').exists()).toBe(true)
  })

  it('hides the CV toggle when there is no pdf and prefers the stage label', async () => {
    state.body = publicFeedback({ hasCv: false, stage: { label: 'Chiacchierata col team', type: 'team_interview', note: null } })
    const wrapper = await mountPage('good')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-page"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="feedback-cv-toggle"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feedback-stage"]').text()).toBe('Chiacchierata col team')
    expect(wrapper.find('[data-testid="feedback-stage-note"]').exists()).toBe(false)
  })

  it('says why an expired link does not work', async () => {
    const wrapper = await mountPage('bad')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="feedback-failure"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="feedback-failure"]').attributes('data-failure')).toBe('expired')
    expect(wrapper.text()).toContain('Link scaduto')
    expect(wrapper.find('[data-testid="feedback-form"]').exists()).toBe(false)
  })
})
