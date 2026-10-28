import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { rate, type ReportsDto } from '@candydati/domain'
import { getQuery, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyReportsFixture, reportsFixture } from '~~/test/fixtures/phase10-fixtures'
import ReportsPanel from './ReportsPanel.vue'

const state = vi.hoisted(() => ({ report: null as ReportsDto | null, failing: false, queries: [] as Record<string, unknown>[] }))
registerEndpoint('/api/v1/reports', (event) => {
  state.queries.push(getQuery(event))
  if (state.failing) return (setResponseStatus(event, 403), { success: false, data: null, error: { code: 'forbidden', message: 'x' } })
  return { success: true, data: state.report, error: null }
})
registerEndpoint('/api/v1/jobs', () => ({
  success: true,
  data: [
    { id: 'j1', slug: 'data', status: 'published', title: 'Data Engineer', role: 'backend_developer', customRole: null, publishable: true, publishIssueCount: 0, salary: { min: 45000, max: 60000, currency: 'EUR', period: 'year' }, workMode: 'hybrid', qualityTotal: 7, belowThreshold: false, updatedAt: '2026-08-01T10:00:00.000Z', publishedAt: '2026-08-01T10:00:00.000Z' },
    { id: 'j0', slug: 'draft', status: 'draft', title: 'Bozza', role: null, customRole: null, publishable: false, publishIssueCount: 2, salary: { min: 45000, max: 60000, currency: 'EUR', period: 'year' }, workMode: null, qualityTotal: null, belowThreshold: false, updatedAt: '2026-08-01T10:00:00.000Z', publishedAt: null },
  ],
  meta: { total: 1, page: 1, limit: 100 },
  error: null,
}))

const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  clearNuxtData()
  const wrapper = await mountSuspended(ReportsPanel)
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="reports-loading"]').exists()).toBe(false))
  return wrapper
}
const text = (wrapper: Awaited<ReturnType<typeof mountPanel>>, id: string): string => wrapper.find(`[data-testid="${id}"]`).text()

beforeEach(() => {
  state.report = reportsFixture()
  state.failing = false
  state.queries = []
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('ReportsPanel', () => {
  it('shows the four headline figures with their basis and a plain explanation', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="report-headlines"]').exists()).toBe(true))
    expect(text(wrapper, 'headline-time-to-hire')).toContain('24')
    expect(text(wrapper, 'headline-time-to-hire')).toContain('su 4 assunzioni')
    expect(text(wrapper, 'headline-responses')).toContain('94%')
    expect(text(wrapper, 'headline-responses')).toContain('47 su 50')
    expect(text(wrapper, 'headline-coverage')).toContain('90%')
    expect(text(wrapper, 'headline-received')).toContain('40')
    expect(text(wrapper, 'headline-received')).toContain('Candidature arrivate nel periodo')
  })

  it('shows a dash, never a percentage, under five cases, and keeps the denominator', async () => {
    state.report = reportsFixture({ outcomeCoverage: rate(3, 4) })
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="headline-coverage"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="headline-coverage"] [data-testid="headline-value"]').text()).toBe('—')
    expect(text(wrapper, 'headline-coverage')).toContain('3 su 4')
    expect(text(wrapper, 'reports-small-sample')).toContain('meno di 5 casi')
  })

  it('draws the funnel in stage order with the conversion and its basis between stages', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="funnel-row"]')).toHaveLength(4))
    const rows = wrapper.findAll('[data-testid="funnel-row"]').map((row) => row.text())
    expect(rows[0]).toContain('Ricevute')
    expect(rows[1]).toContain('Chiamata conoscitiva')
    const conversions = wrapper.findAll('[data-testid="funnel-conversion"]').map((row) => row.text())
    expect(conversions[0]).toContain('50%')
    expect(conversions[0]).toContain('20 su 40')
    expect(conversions).toHaveLength(3)
    expect(text(wrapper, 'funnel-outcomes')).toContain('Non selezionate')
  })

  it('lists sources, response times by stage type and timing per job as text', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="source-rows"]').exists()).toBe(true))
    const sources = wrapper.findAll('[data-testid="source-row"]').map((row) => row.text())
    expect(sources[0]).toContain('linkedin')
    expect(sources[0]).toContain('2 assunzioni, tasso di assunzione 10%')
    expect(sources[1]).toContain('Diretta')
    expect(sources[3]).toContain('1 assunzione')
    expect(sources[3]).not.toContain('tasso di assunzione')
    expect(text(wrapper, 'responses-kept')).toContain('94%')
    expect(text(wrapper, 'responses-median')).toBe('30 h')
    expect(wrapper.findAll('[data-testid="response-row"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="response-row"]')[0]?.text()).toContain('Prima risposta dopo la candidatura')
    const times = wrapper.findAll('[data-testid="time-row"]')
    expect(times).toHaveLength(3)
    expect(times[1]?.text()).toContain('Backend <Developer>')
    expect(wrapper.find('[data-testid="time-table"]').html()).not.toContain('<Developer>')
    expect(times[2]?.text()).toContain('—')
  })

  it('shows visits and applications per 100 visits per source, and says when there are too few visits for a rate', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="source-rows"]').exists()).toBe(true))
    const visits = wrapper.findAll('[data-testid="source-visits"]').map((row) => row.text())
    expect(visits[0]).toBe('160 visite, 13 candidature ogni 100 visite')
    expect(visits[1]).toBe('90 visite, 13 candidature ogni 100 visite')
    expect(visits[2]).toBe('nessuna visita')
    expect(visits[3]).toBe('4 visite, troppo poche per un tasso')
    expect(wrapper.find('[data-testid="sources-no-visits"]').exists()).toBe(false)
  })

  it('lists the campaigns under the sources', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="campaigns"]').exists()).toBe(true))
    const rows = wrapper.findAll('[data-testid="campaign-row"]').map((row) => row.text())
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('linkedin / autumn')
    expect(rows[0]).toContain('100 visite, 14 candidature ogni 100 visite, 2 assunzioni')
    expect(rows[1]).toContain('linkedin / spring')
  })

  it('explains how to get visits when the period has applications but no visits, and has no campaign list', async () => {
    state.report = reportsFixture({ sources: [{ origin: 'direct', applications: 6, hires: 0, visits: 0, conversion: null }], campaigns: [] })
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="sources-no-visits"]').exists()).toBe(true))
    expect(text(wrapper, 'sources-no-visits')).toContain('scheda Distribuzione')
    expect(wrapper.find('[data-testid="campaigns"]').exists()).toBe(false)
  })

  it('keeps the rest of the page when the funnel is invalid, with a short error in that card only', async () => {
    const report = reportsFixture()
    state.report = { ...report, funnel: { ...report.funnel, stages: [{ ...report.funnel.stages[0]!, conversionToNext: { count: 4, total: 3, rate: 1.3333 } }] } }
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="report-funnel"]').exists()).toBe(true))
    expect(text(wrapper, 'report-funnel')).toContain('Questa sezione non può essere mostrata.')
    expect(wrapper.find('[data-testid="reports-error"]').exists()).toBe(false)
    expect(text(wrapper, 'headline-received')).toContain('—')
    expect(text(wrapper, 'headline-responses')).toContain('94%')
    expect(wrapper.find('[data-testid="source-rows"]').exists()).toBe(true)
  })

  it('asks for the last 90 days first, then the chosen job, and links the CSV of the same filters', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="report-job"] option[value="j1"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="report-job"] option[value="j0"]').exists()).toBe(false)
    expect(state.queries[0]).not.toHaveProperty('jobId')
    await wrapper.find('select[data-testid="report-job"]').setValue('j1')
    await vi.waitFor(() => expect(state.queries.at(-1)).toMatchObject({ jobId: 'j1' }))
    const href = wrapper.find('[data-testid="report-export"]').attributes('href') ?? ''
    expect(href).toMatch(/^\/api\/v1\/reports\/export\.csv\?from=.+&to=.+&jobId=j1$/)
  })

  it('checks a custom period before asking for it', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('select[data-testid="report-period"]').setValue('custom')
    await wrapper.find('#report-from').setValue('2026-04-01')
    await wrapper.find('#report-to').setValue('2026-03-31')
    const before = state.queries.length
    await wrapper.find('[data-testid="report-custom"]').trigger('submit')
    expect(text(wrapper, 'report-period-error')).toContain('La data di inizio viene dopo')
    await wrapper.find('#report-from').setValue('2026-01-01')
    await wrapper.find('[data-testid="report-custom"]').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(state.queries.length).toBeGreaterThan(before))
    expect(state.queries.at(-1)).toMatchObject({ from: '2026-01-01T00:00:00.000Z', to: '2026-03-31T23:59:59.999Z' })
  })

  it('shows one empty state when nothing happened, and an error with retry instead of numbers', async () => {
    state.report = emptyReportsFixture()
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="reports-empty"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="report-funnel"]').exists()).toBe(false)
    state.failing = true
    const failing = await mountPanel()
    await vi.waitFor(() => expect(failing.find('[data-testid="reports-error"]').exists()).toBe(true))
    expect(failing.find('[data-testid="report-headlines"]').exists()).toBe(false)
  })
})
