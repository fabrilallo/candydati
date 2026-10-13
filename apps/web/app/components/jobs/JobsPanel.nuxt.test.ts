import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOW, ok } from '~~/test/fixtures/job-fixtures'
import JobsPanel from './JobsPanel.vue'

const state = vi.hoisted(() => ({ urls: [] as string[], total: 41, empty: false }))
const summary = (id: string, status: string, title = `Annuncio ${id}`) => ({
  id,
  slug: id,
  status,
  title,
  role: 'backend_developer',
  publishable: status !== 'draft',
  qualityTotal: status === 'draft' ? null : 7.5,
  updatedAt: NOW,
  publishedAt: null,
})
registerEndpoint('/api/v1/jobs', (event) => {
  state.urls.push(event.node.req.url ?? '')
  const params = new URL(event.node.req.url ?? '', 'http://x').searchParams
  const status = params.get('status')
  const page = Number(params.get('page'))
  const data = state.empty ? [] : [summary(`p${page}-a`, status ?? 'published'), summary(`p${page}-b`, 'draft', '')]
  return ok(data, { total: state.empty ? 0 : state.total, page, limit: 20 })
})

const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  const wrapper = await mountSuspended(JobsPanel)
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.findAll('[data-testid="job-row"], [data-testid="jobs-empty"]').length).toBeGreaterThan(0))
  return wrapper
}

beforeEach(() => {
  state.urls.length = 0
  state.empty = false
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('JobsPanel', () => {
  it('lists title, role, status, publishable, quality and last update', async () => {
    const wrapper = await mountPanel()
    const rows = wrapper.findAll('[data-testid="job-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('Annuncio p1-a')
    expect(rows[0]?.text()).toContain('Backend developer')
    expect(rows[0]?.find('[data-status]').attributes('data-status')).toBe('published')
    expect(rows[0]?.find('[data-testid="job-publishable"]').attributes('data-publishable')).toBe('true')
    expect(rows[0]?.find('[data-testid="job-quality"]').text()).toBe('7,5')
    expect(rows[0]?.find('time').attributes('datetime')).toBe(NOW)
    expect(rows[0]?.find('a').attributes('href')).toBe('/app/jobs/p1-a')
    expect(rows[1]?.text()).toContain('Senza titolo')
    expect(rows[1]?.find('[data-testid="job-quality"]').text()).toBe('Non analizzato')
  })

  it('filters by status and goes back to page 1, keeping everything out of the URL', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="filter-draft"]').trigger('click')
    await vi.waitFor(() => expect(state.urls.at(-1)).toMatch(/api\/v1\/jobs\?status=draft&page=1&limit=20$/))
    expect(wrapper.find('[data-testid="filter-draft"]').attributes('aria-pressed')).toBe('true')
    expect(useRoute().fullPath).not.toContain('status')
    expect(useRoute().fullPath).not.toContain('page')
  })

  it('paginates like the audit log', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.text()).toContain('Pagina 1 di 3 · 41 annunci')
    const next = wrapper.findAll('nav button').find((button) => button.text().includes('Pagina successiva'))
    await next?.trigger('click')
    await vi.waitFor(() => expect(state.urls.at(-1)).toMatch(/api\/v1\/jobs\?page=2&limit=20$/))
    await flushPromises()
    await wrapper.find('[data-testid="filter-closed"]').trigger('click')
    await vi.waitFor(() => expect(state.urls.at(-1)).toMatch(/api\/v1\/jobs\?status=closed&page=1&limit=20$/))
  })

  it('shows an empty state', async () => {
    state.empty = true
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="jobs-empty"]').text()).toContain('Ancora nessun annuncio')
    expect(wrapper.find('nav').exists()).toBe(false)
  })
})
