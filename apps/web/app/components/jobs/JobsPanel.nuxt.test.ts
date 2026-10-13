import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOW, ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import JobsPanel from './JobsPanel.vue'

const state = vi.hoisted(() => ({ urls: [] as string[], total: 41, empty: false, stale: [] as unknown[] }))
registerEndpoint('/api/v1/jobs/stale', () => ok(state.stale))
const summary = (id: string, status: string, title = `Annuncio ${id}`) => ({
  id,
  slug: id,
  status,
  title,
  role: 'backend_developer',
  publishable: status !== 'draft',
  publishIssueCount: status === 'draft' ? 3 : 0,
  salary: { min: 45000, max: 60000, currency: 'EUR', period: 'year' },
  workMode: 'hybrid',
  qualityTotal: status === 'draft' ? null : status === 'closed' ? 4.2 : 7.5,
  belowThreshold: status === 'closed',
  updatedAt: NOW,
  publishedAt: null,
})
const staleJob = (id: string, daysSinceActivity: number) => ({
  id,
  title: `Annuncio ${id}`,
  publishedAt: null,
  lastActivityAt: NOW,
  daysSinceActivity,
  openApplications: 0,
})
registerEndpoint('/api/v1/jobs', (event) => {
  const params = new URL(event.node.req.url ?? '', 'http://x').searchParams
  const status = params.get('status')
  if (params.get('limit') === '1') return ok([], { total: status === 'draft' ? 3 : status === 'closed' ? 1 : 2, page: 1, limit: 1 })
  state.urls.push(event.node.req.url ?? '')
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
  state.stale = []
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('JobsPanel', () => {
  it('lists title, role, status, salary, quality and relative last update', async () => {
    const wrapper = await mountPanel()
    const rows = wrapper.findAll('[data-testid="job-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('Annuncio p1-a')
    expect(rows[0]?.text()).toContain('Backend developer')
    expect(rows[0]?.text()).toContain('Ibrido')
    expect(rows[0]?.find('[data-status]').attributes('data-status')).toBe('published')
    expect(rows[0]?.find('[data-testid="job-salary"]').text().replace(/\s/g, ' ')).toBe('45.000 € - 60.000 €')
    expect(rows[0]?.find('[data-testid="job-quality"]').text()).toContain('7,5')
    expect(rows[0]?.find('[data-testid="job-below-threshold"]').exists()).toBe(false)
    expect(rows[0]?.find('time').attributes('datetime')).toBe(NOW)
    expect(rows[0]?.find('a').attributes('href')).toBe('/app/jobs/p1-a')
  })

  it('marks only the stale published ad with a quiet badge', async () => {
    state.stale = [staleJob('p1-a', 120), staleJob('p1-b', 95)]
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="job-stale"]').exists()).toBe(true))
    const badges = wrapper.findAll('[data-testid="job-stale"]')
    expect(badges).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="job-row"]')[0]?.find('[data-testid="job-stale"]').text()).toBe('Fermo da 120 giorni')
  })

  it('tells a draft what is missing and shows no score for it', async () => {
    const wrapper = await mountPanel()
    const draft = wrapper.findAll('[data-testid="job-row"]')[1]
    expect(draft?.text()).toContain('Senza titolo')
    expect(draft?.find('[data-testid="job-publishable"]').attributes('data-publishable')).toBe('false')
    expect(draft?.text()).toContain('Mancano 3 elementi')
    expect(draft?.find('[data-testid="job-quality"]').exists()).toBe(false)
  })

  it('flags a score below the threshold', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="filter-closed"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="job-below-threshold"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="job-below-threshold"]').text()).toBe('Sotto soglia')
  })

  it('shows how many ads each status has', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="count-draft"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="count-all"]').text()).toBe('6')
    expect(wrapper.find('[data-testid="count-draft"]').text()).toBe('3')
    expect(wrapper.find('[data-testid="count-published"]').text()).toBe('2')
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
    expect(wrapper.find('[data-testid="jobs-empty"] a').attributes('href')).toBe('/app/jobs/new')
    expect(wrapper.find('nav').exists()).toBe(false)
  })

  it('explains each empty filter and offers a way back', async () => {
    const wrapper = await mountPanel()
    state.empty = true
    await wrapper.find('[data-testid="filter-published"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="jobs-empty"]').text()).toContain('Nessun annuncio pubblicato'))
    expect(wrapper.find('[data-testid="jobs-empty"] a').exists()).toBe(false)
    await wrapper.find('[data-testid="show-all"]').trigger('click')
    expect(wrapper.find('[data-testid="filter-all"]').attributes('aria-pressed')).toBe('true')
  })

  it('offers creation only to roles that can create ads', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    state.empty = true
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="jobs-empty"] a').exists()).toBe(false)
  })
})
