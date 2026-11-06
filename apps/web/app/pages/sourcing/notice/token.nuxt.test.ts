import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { setResponseStatus } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import Page from './[token].vue'

const state = vi.hoisted(() => ({ objected: 0 }))
const view = {
  organizationName: 'Acme', jobTitle: 'Backend Developer', language: 'it', firstName: 'Maja', lastName: 'Lind', headline: 'Backend engineer', location: 'Stockholm',
  source: 'linkedin', profileUrl: 'https://www.linkedin.com/in/maja-lind', email: null, evidence: [{ criterion: 'Go', text: '4 anni di Go', where: null }],
  collectedAt: '2026-11-06T10:00:00.000Z', expiresAt: '2026-12-06T10:00:00.000Z',
}
registerEndpoint('/api/v1/public/sourcing-notice/good-token-1234567', { method: 'GET', handler: () => ok(view) })
registerEndpoint('/api/v1/public/sourcing-notice/good-token-1234567/object', { method: 'POST', handler: () => (state.objected++, ok({ erased: true })) })
registerEndpoint('/api/v1/public/sourcing-notice/gone-token-1234567', {
  method: 'GET',
  handler: (event) => {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: { code: 'not_found', message: 'x' } }
  },
})

const mounted: { unmount: () => void }[] = []
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('sourcing notice page', () => {
  it('shows the person what is kept, from where and until when, and erases it on request', async () => {
    const wrapper = await mountSuspended(Page, { route: '/sourcing/notice/good-token-1234567', attachTo: document.body })
    mounted.push(wrapper)
    expect(wrapper.find('[data-testid="sourcing-notice-intro"]').text()).toContain('profilo pubblico LinkedIn')
    expect(wrapper.find('[data-testid="sourcing-notice-data"]').text()).toContain('Maja Lind')
    expect(wrapper.find('[data-testid="sourcing-notice-data"]').text()).toContain('4 anni di Go')
    expect(wrapper.find('[data-testid="sourcing-notice-deadline"]').text()).toContain('6 dic 2026')
    await wrapper.find('[data-testid="sourcing-notice-erase"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="sourcing-notice-erased"]').exists()).toBe(true))
    expect(state.objected).toBe(1)
  })

  it('says the link no longer works, without telling whether it ever did', async () => {
    const wrapper = await mountSuspended(Page, { route: '/sourcing/notice/gone-token-1234567', attachTo: document.body })
    mounted.push(wrapper)
    expect(wrapper.find('[data-testid="sourcing-notice-failure"]').attributes('data-failure')).toBe('invalid')
  })
})
