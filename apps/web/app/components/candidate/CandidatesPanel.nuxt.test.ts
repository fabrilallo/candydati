import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { summary } from '~~/test/fixtures/candidate-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import CandidatesPanel from './CandidatesPanel.vue'

const state = vi.hoisted(() => ({ urls: [] as string[], empty: false }))
registerEndpoint('/api/v1/candidates', (event) => {
  const url = (event.node.req.url ?? '').replace(/^\/_/, '')
  state.urls.push(url)
  const params = new URL(url, 'http://x').searchParams
  const page = Number(params.get('page'))
  const data = state.empty ? [] : [summary(`p${page}-a`, { talentPool: true, tags: ['golang', 'remote'] }), summary(`p${page}-b`, { retentionExpiresAt: '2020-01-01T00:00:00.000Z' })]
  return ok(data, { total: state.empty ? 0 : 45, page, limit: 20 })
})

const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  const wrapper = await mountSuspended(CandidatesPanel)
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.findAll('[data-testid="candidate-row"], [data-testid="candidates-empty"]').length).toBeGreaterThan(0))
  return wrapper
}

beforeEach(() => {
  state.urls.length = 0
  state.empty = false
  clearNuxtData('candidates-list')
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
})

describe('CandidatesPanel', () => {
  it('lists people with email, tags, applications and retention expiry', async () => {
    const wrapper = await mountPanel()
    const rows = wrapper.findAll('[data-testid="candidate-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.find('a').attributes('href')).toBe('/app/candidates/p1-a')
    expect(rows[0]?.text()).toContain('p1-a@example.com')
    expect(rows[0]?.find('[data-testid="talent-pool"]').exists()).toBe(true)
    expect(rows[0]?.text()).toContain('golang')
    expect(rows[0]?.text()).toContain('1 candidatura')
    expect(rows[1]?.find('[data-testid="candidate-retention"] span').classes()).toContain('text-destructive')
    expect(wrapper.text()).toContain('Pagina 1 di 3 · 45 candidati')
  })

  it('searches after a pause, keeping the filters out of the URL', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="candidates-search"]').setValue('rossi')
    await vi.waitFor(() => expect(state.urls.at(-1)).toBe('/api/v1/candidates?query=rossi&page=1&limit=20'), { timeout: 2000 })
    expect(useRoute().fullPath).not.toContain('rossi')
  })

  it('shows only the talent pool, and filters by a tag from a row', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="scope-pool"]').trigger('click')
    await vi.waitFor(() => expect(state.urls.at(-1)).toBe('/api/v1/candidates?talentPool=true&page=1&limit=20'))
    expect(wrapper.text()).toContain('Solo chi ha accettato di restare nel database')
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="candidate-row"]').length).toBe(2))
    await wrapper.findAll('[data-testid="candidate-row"]')[0]?.find('ul button').trigger('click')
    await vi.waitFor(() => expect(state.urls.at(-1)).toBe('/api/v1/candidates?tag=golang&talentPool=true&page=1&limit=20'))
    expect(wrapper.find('[data-testid="active-tag"]').text()).toBe('golang')
    await wrapper.find('[data-testid="active-tag"]').trigger('click')
    await vi.waitFor(() => expect(state.urls.at(-1)).toBe('/api/v1/candidates?talentPool=true&page=1&limit=20'))
  })

  it('applies a typed tag', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="candidates-tag"]').setValue(' Kafka ')
    await wrapper.find('[data-testid="candidates-tag"]').trigger('blur')
    await vi.waitFor(() => expect(state.urls.at(-1)).toBe('/api/v1/candidates?tag=kafka&page=1&limit=20'))
  })

  it('paginates', async () => {
    const wrapper = await mountPanel()
    const next = wrapper.findAll('nav button').find((button) => button.text().includes('Pagina successiva'))
    await next?.trigger('click')
    await vi.waitFor(() => expect(state.urls.at(-1)).toBe('/api/v1/candidates?page=2&limit=20'))
  })

  it('explains an empty database', async () => {
    state.empty = true
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="candidates-empty"]').text()).toContain('Ancora nessun candidato')
    expect(wrapper.find('nav').exists()).toBe(false)
  })
})
