import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JobsOverview from './JobsOverview.vue'

const state = vi.hoisted(() => ({ totals: { draft: 0, published: 0, closed: 0 } as Record<string, number>, failing: false }))
registerEndpoint('/api/v1/jobs', (event) => {
  if (state.failing) {
    event.node.res.statusCode = 403
    return { success: false, data: null, error: { code: 'forbidden', message: 'x' } }
  }
  const status = new URL(event.node.req.url ?? '', 'http://x').searchParams.get('status') ?? ''
  return { success: true, data: [], error: null, meta: { total: state.totals[status] ?? 0, page: 1, limit: 1 } }
})

const mounted: { unmount: () => void }[] = []
const mountOverview = async (props = { careersPath: '/careers/acme', canCreate: true, canInvite: true }) => {
  clearNuxtData('job-counts')
  const wrapper = await mountSuspended(JobsOverview, { props })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="counts-loading"]').exists()).toBe(false))
  return wrapper
}

beforeEach(() => {
  state.totals = { draft: 0, published: 0, closed: 0 }
  state.failing = false
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('JobsOverview', () => {
  it('shows the real total of each status and links to the careers page', async () => {
    state.totals = { draft: 3, published: 2, closed: 1 }
    const wrapper = await mountOverview()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="count-draft"]').exists()).toBe(true))
    const value = (status: string) => wrapper.find(`[data-testid="count-${status}"] [data-testid="count-value"]`).text()
    expect([value('draft'), value('published'), value('closed')]).toEqual(['3', '2', '1'])
    expect(wrapper.find('a[href="/careers/acme"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="first-steps"]').exists()).toBe(false)
  })

  it('guides the first steps when there is no job yet, hiding what the role cannot do', async () => {
    const wrapper = await mountOverview({ careersPath: '/careers/acme', canCreate: true, canInvite: false })
    await vi.waitFor(() => expect(wrapper.find('[data-testid="first-steps"]').exists()).toBe(true))
    const links = wrapper.findAll('[data-testid="first-steps"] a').map((link) => link.attributes('href'))
    expect(links).toEqual(['/app/jobs/new', '/careers/acme'])
  })

  it('shows the error with a retry instead of made-up numbers', async () => {
    state.failing = true
    const wrapper = await mountOverview()
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="count-draft"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Riprova')
  })
})
