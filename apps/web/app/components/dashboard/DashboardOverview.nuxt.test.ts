import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { JobStatsDto } from '@candydati/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyJobStats, jobStatsFixture } from '~~/test/fixtures/job-stats'
import { viewerWith } from '~~/test/fixtures/job-fixtures'
import { reportsFixture } from '~~/test/fixtures/phase10-fixtures'
import DashboardOverview from './DashboardOverview.vue'

// The charts draw with d3 into real layout, which happy-dom does not have; they are checked in the browser.
// Here every chart is a slot-forwarding stub, so the cards, figures and text alternatives are what is tested.
vi.mock('@unovis/vue', async () => {
  const { defineComponent, h } = await import('vue')
  const stub = (name: string) => defineComponent({ name, inheritAttrs: false, setup: (_, { slots }) => () => h('div', { 'data-chart': name }, slots.default?.()) })
  const names = ['VisSingleContainer', 'VisXYContainer', 'VisDonut', 'VisTooltip', 'VisGroupedBar', 'VisStackedBar', 'VisAxis', 'VisCrosshair', 'VisPlotline']
  return Object.fromEntries(names.map((name) => [name, stub(name)]))
})
vi.mock('@unovis/ts', () => ({ Donut: { selectors: { segment: 'segment' } }, StackedBar: { selectors: { bar: 'bar' } } }))

const state = vi.hoisted(() => ({ stats: null as JobStatsDto | null, failing: false }))
const SET_UP = { privacyNotice: true, careersPage: true, jobCreated: true, jobPublished: true, team: true }
const setup = { value: { ...SET_UP, privacyNotice: false, careersPage: false, jobCreated: false, jobPublished: false, team: false } }
registerEndpoint('/api/v1/setup-progress', () => ({ success: true, data: setup.value, error: null }))
registerEndpoint('/api/v1/stats/jobs', (event) => {
  if (state.failing) {
    event.node.res.statusCode = 403
    return { success: false, data: null, error: { code: 'forbidden', message: 'x' } }
  }
  return { success: true, data: state.stats, error: null }
})

registerEndpoint('/api/v1/reports', () => ({ success: true, data: reportsFixture(), error: null }))

/** Intl puts a no-break space before the euro sign. */
const plain = (text: string): string => text.replace(/\s/g, ' ')
const mounted: { unmount: () => void }[] = []
const mountOverview = async (props = { canCreate: true }, role: Parameters<typeof viewerWith>[0] = 'owner') => {
  clearNuxtData('job-stats')
  clearNuxtData('setup-progress')
  clearNuxtData('dashboard-reports')
  useViewer().viewer.value = viewerWith(role)
  const wrapper = await mountSuspended(DashboardOverview, { props })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="stats-loading"]').exists()).toBe(false))
  return wrapper
}

beforeEach(() => {
  setup.value = { ...SET_UP, privacyNotice: false, careersPage: false, jobCreated: false, jobPublished: false, team: false }
  state.stats = jobStatsFixture()
  state.failing = false
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('DashboardOverview', () => {
  it('shows the real counts per status and every statistic card', async () => {
    setup.value = SET_UP
    const wrapper = await mountOverview()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="stat-status"]').exists()).toBe(true))
    const value = (status: string) => wrapper.find(`[data-testid="count-${status}"] [data-testid="count-value"]`).text()
    expect([value('draft'), value('published'), value('closed')]).toEqual(['2', '3', '1'])
    for (const id of ['stat-activity', 'stat-quality', 'stat-process', 'stat-salary', 'stat-readiness', 'candidate-metrics']) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists(), id).toBe(true)
    }
    expect(wrapper.find('[data-testid="first-steps"]').exists()).toBe(false)
  })

  it('keeps the setup checklist above the statistics while something is left to set up', async () => {
    state.stats = jobStatsFixture()
    setup.value = { ...SET_UP, privacyNotice: false }
    const wrapper = await mountOverview()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="first-steps"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="stat-status"]').exists()).toBe(true)
  })

  it('shows no quality score while the instance has no model, and says why', async () => {
    const stats = jobStatsFixture()
    state.stats = { ...stats, quality: { ...stats.quality, available: false, items: [], average: null, belowCount: 0 } }
    const wrapper = await mountOverview()
    const card = wrapper.find('[data-testid="stat-quality"]')
    expect(card.find('[data-testid="quality-ai-off"]').text()).toContain("richiede l'AI")
    expect(card.text()).not.toContain('sotto soglia')
    expect(card.find('[data-testid="chart-empty"]').exists()).toBe(false)
  })

  it('states the figures as text: medians, process averages, quality and blockers', async () => {
    const wrapper = await mountOverview()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="stat-salary"]').exists()).toBe(true))
    expect(plain(wrapper.find('[data-testid="stat-salary"]').text())).toContain('42.500 €')
    expect(wrapper.find('[data-testid="stat-salary"]').text()).toContain('1 annuncio in un\'altra valuta')
    expect(wrapper.find('[data-testid="process-stages"]').text()).toContain('2,7')
    expect(wrapper.find('[data-testid="process-time"]').text()).toContain('2 h 30 min')
    expect(wrapper.find('[data-testid="process-response"]').text()).toContain('4,3 giorni')
    expect(wrapper.find('[data-testid="stat-quality"]').text()).toContain('1 sotto soglia')
    expect(wrapper.find('[data-testid="quality-legend"]').text()).toContain('Soglia 6')
    const blockers = wrapper.findAll('[data-testid="blocker"]').map((row) => row.text())
    expect(blockers[0]).toContain('Manca: RAL minima')
    expect(blockers[0]).toContain('2 bozze')
    expect(blockers[1]).toContain('Nessuna fase di selezione')
  })

  it('keeps a text alternative for each chart', async () => {
    const wrapper = await mountOverview()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="stat-quality"] table').exists()).toBe(true))
    expect(wrapper.find('[data-testid="stat-quality"] table').text()).toContain('Data Engineer')
    expect(plain(wrapper.find('[data-testid="stat-salary"] table').text())).toContain('52.000 €')
    expect(wrapper.findAll('[data-testid="stat-activity"] table tbody tr')).toHaveLength(12)
  })

  it('guides the first steps and shows honest empty states when there is no ad', async () => {
    state.stats = emptyJobStats()
    const wrapper = await mountOverview({ canCreate: true })
    await vi.waitFor(() => expect(wrapper.find('[data-testid="first-steps"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="stat-status"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="chart-empty"]').length).toBeGreaterThanOrEqual(5)
    expect(wrapper.find('[data-testid="candidate-metrics"]').exists()).toBe(true)
  })

  it('heads the candidate figures with the real numbers of the reports, and links to them', async () => {
    const wrapper = await mountOverview()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="report-headlines"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="candidate-metrics"]').text()).toContain('Candidati negli ultimi 30 giorni')
    expect(wrapper.find('[data-testid="candidate-metrics-reports"]').attributes('href')).toBe('/app/reports')
    expect(wrapper.text()).not.toContain('arrivano con le candidature')
  })

  it('leaves the candidate figures out for whoever may not read the reports', async () => {
    const wrapper = await mountOverview({ canCreate: false }, 'interviewer')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="stat-quality"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="candidate-metrics"]').exists()).toBe(false)
  })

  it('shows the error with a retry instead of made-up numbers', async () => {
    state.failing = true
    const wrapper = await mountOverview()
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="stat-status"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Riprova')
  })
})
