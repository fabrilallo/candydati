import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { getQuery } from 'h3'
import type { PipelineDto, TrackedLinkDto } from '@candydati/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { card, pipeline } from '~~/test/fixtures/candidate-fixtures'
import { ok } from '~~/test/fixtures/job-fixtures'
import { trafficPeriod } from '@/lib/traffic-view'
import JobSourcesPanel from './JobSourcesPanel.vue'

// The chart draws with d3 into real layout, which happy-dom does not have; it is checked in the browser (e2e). Here it
// is a slot-forwarding stub, so the figures, the table alternative and the lists are what is tested.
vi.mock('@unovis/vue', async () => {
  const { defineComponent, h } = await import('vue')
  const stub = (name: string) => defineComponent({ name, inheritAttrs: false, setup: (_, { slots }) => () => h('div', { 'data-chart': name }, slots.default?.()) })
  const names = ['VisXYContainer', 'VisTooltip', 'VisStackedBar', 'VisAxis', 'VisCrosshair']
  return Object.fromEntries(names.map((name) => [name, stub(name)]))
})

const today = trafficPeriod(1, new Date()).to
const row = (origin: string, campaign: string, visits: number, applications: number) => ({ day: today, origin, campaign, visits, applications })

const state = vi.hoisted(() => ({ rows: [] as unknown[], queries: [] as Record<string, unknown>[], fail: false }))
registerEndpoint('/api/v1/jobs/job-1/traffic', (event) => {
  state.queries.push(getQuery(event))
  if (state.fail) return { success: false, data: null, error: { code: 'internal', message: 'x' } }
  return ok({ jobId: 'job-1', from: 'a', to: 'b', rows: state.rows })
})

const link = (source: string, campaign = ''): TrackedLinkDto => ({ id: `tl-${source}-${campaign}`, jobId: 'job-1', source, campaign, createdAt: '2026-10-01T10:00:00.000Z' })
const board = (): PipelineDto =>
  pipeline([
    card('a1', 'stage-0', { origin: 'linkedin', campaign: 'autumn', createdAt: '2026-10-20T10:00:00.000Z' }),
    card('a2', 'received', { origin: 'linkedin', campaign: null, createdAt: '2026-10-21T10:00:00.000Z' }),
    card('a3', 'received', { origin: 'direct', campaign: null, outcome: 'hired' }),
  ])

const mounted: { unmount: () => void }[] = []
const mountPanel = async (props: { pipeline?: PipelineDto | null; links?: readonly TrackedLinkDto[] } = {}) => {
  const wrapper = await mountSuspended(JobSourcesPanel, {
    props: { jobId: 'job-1', links: props.links ?? [], pipeline: props.pipeline === undefined ? board() : props.pipeline },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="traffic-tiles"]').exists() || wrapper.find('[data-testid="job-sources-error"]').exists()).toBe(true))
  return wrapper
}
const text = (wrapper: Awaited<ReturnType<typeof mountPanel>>, id: string): string => wrapper.find(`[data-testid="${id}"]`).text()

beforeEach(() => {
  state.rows = [row('linkedin', 'autumn', 20, 2), row('linkedin', '', 4, 1), row('direct', '', 6, 0)]
  state.queries = []
  state.fail = false
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('JobSourcesPanel', () => {
  it('asks for the last 30 days of this ad and shows visits, applications and applications per 100 visits', async () => {
    const wrapper = await mountPanel()
    expect(state.queries[0]).toMatchObject({ to: `${today}T23:59:59.999Z` })
    expect(text(wrapper, 'traffic-visits')).toBe('30')
    expect(text(wrapper, 'traffic-applications')).toBe('3')
    expect(text(wrapper, 'traffic-conversion')).toBe('10')
    expect(text(wrapper, 'traffic-conversion-note')).toContain('3 candidature su 30 visite')
    expect(wrapper.find('[data-testid="traffic-table"] caption').text()).toBe('Visite e candidature per giorno, Tutte le fonti, ultimi 30 giorni')
    expect(wrapper.findAll('[data-testid="traffic-table"] tbody tr')).toHaveLength(1)
  })

  it('says why there is no rate with one visit and one application', async () => {
    state.rows = [row('linkedin', '', 1, 1)]
    const wrapper = await mountPanel()
    expect(text(wrapper, 'traffic-conversion')).toBe('—')
    expect(text(wrapper, 'traffic-conversion-note')).toBe('Servono almeno 5 visite per un numero affidabile: finora 1 visita.')
  })

  it('lists each source with its campaigns and, once one is chosen, who applied through it', async () => {
    const wrapper = await mountPanel()
    const sources = wrapper.findAll('[data-testid="source-table-row"]').map((r) => r.text())
    expect(sources).toEqual(['LinkedIn24313', 'Diretta600'])
    expect(wrapper.findAll('[data-testid="source-table-campaign"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="source-applications"]').exists()).toBe(false)
    await wrapper.find('[data-testid="source-table-row"] button').trigger('click')
    await flushPromises()
    expect(text(wrapper, 'traffic-visits')).toBe('24')
    expect((wrapper.find('#traffic-source').element as HTMLSelectElement).value).toBe('linkedin')
    const people = wrapper.findAll('[data-testid="source-application"]')
    expect(people.map((p) => p.find('a').text())).toEqual(['Giulia Rossi a2', 'Giulia Rossi a1'])
    expect(people[0]!.find('a').attributes('href')).toBe('/app/candidates/c-a2?application=a2&viaJobId=job-1')
    expect(people[1]!.text()).toContain('Chiamata conoscitiva')
  })

  it('offers the saved links in the source select, also before they have figures', async () => {
    const wrapper = await mountPanel({ links: [link('indeed')] })
    await wrapper.find('#traffic-source').setValue('indeed|')
    await flushPromises()
    expect(text(wrapper, 'traffic-visits')).toBe('0')
    expect(text(wrapper, 'source-applications-none')).toBe('Nessuna candidatura arrivata da qui.')
    expect(wrapper.find('[data-testid="sources-no-visits"]').exists()).toBe(true)
  })

  it('reads again when the period changes', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('#traffic-period [role="radio"]').trigger('click')
    await vi.waitFor(() => expect(state.queries).toHaveLength(2))
    expect(state.queries[1]).toMatchObject({ from: `${trafficPeriod(7, new Date()).from}T00:00:00.000Z` })
  })

  it('lists nobody without access to candidates', async () => {
    const wrapper = await mountPanel({ pipeline: null })
    await wrapper.find('[data-testid="source-table-row"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="source-applications"]').exists()).toBe(false)
  })

  it('says when the figures could not be loaded and tries again', async () => {
    state.fail = true
    const wrapper = await mountPanel()
    state.fail = false
    await wrapper.find('[data-testid="job-sources-error"] button').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="traffic-tiles"]').exists()).toBe(true))
  })
})
