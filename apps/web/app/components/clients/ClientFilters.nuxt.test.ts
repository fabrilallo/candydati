import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { getQuery } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { client } from '~~/test/fixtures/client-fixtures'
import { NOW, ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { reportsFixture } from '~~/test/fixtures/phase10-fixtures'
import JobsPanel from '../jobs/JobsPanel.vue'
import JobTabs from '../jobs/JobTabs.vue'
import ReportsPanel from '../reports/ReportsPanel.vue'

const state = vi.hoisted(() => ({ on: true, jobQueries: [] as Record<string, unknown>[], reportQueries: [] as Record<string, unknown>[], jobClient: null as unknown }))
registerEndpoint('/api/v1/settings/agency', () => ok({ recruitsForClients: state.on, agencyAuthorization: null }))
registerEndpoint('/api/v1/clients', () => ok([client(), client({ id: 'c2', name: 'Beta', archived: true })]))
registerEndpoint('/api/v1/jobs/stale', () => ok([]))
registerEndpoint('/api/v1/jobs/j1/pipeline', () => ok({ job: { id: 'j1', title: 'x', status: 'published' }, stages: [], applications: [] }))
registerEndpoint('/api/v1/jobs/j1/client', () => ok({ jobId: 'j1', client: state.jobClient, display: 'named' }))
const summary = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  slug: id,
  status: 'published',
  title: `Annuncio ${id}`,
  role: 'backend_developer',
  customRole: null,
  publishable: true,
  publishIssueCount: 0,
  salary: { min: 45000, max: 60000, currency: 'EUR', period: 'year' },
  workMode: 'hybrid',
  qualityTotal: 7,
  belowThreshold: false,
  updatedAt: NOW,
  publishedAt: NOW,
  ...extra,
})
registerEndpoint('/api/v1/jobs', (event) => {
  const query = getQuery(event)
  if (query.limit === '1') return ok([], { total: 2, page: 1, limit: 1 })
  if (query.limit === '20') state.jobQueries.push(query)
  return ok([summary('j1', { client: { id: 'c1', name: 'Acme Spa', display: 'named' } }), summary('j2', { client: { id: 'c1', name: 'Acme Spa', display: 'confidential' } }), summary('j3', { client: null })], {
    total: 3,
    page: 1,
    limit: 20,
  })
})
registerEndpoint('/api/v1/reports', (event) => {
  state.reportQueries.push(getQuery(event))
  return ok(reportsFixture())
})

const mounted: { unmount: () => void }[] = []
const mount = async (component: unknown, props: Record<string, unknown> = {}) => {
  const wrapper = await mountSuspended(component as never, { props } as never)
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  state.on = true
  state.jobQueries = []
  state.reportQueries = []
  state.jobClient = null
  clearNuxtData()
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('client filters of an agency', () => {
  it('names the client on each job row and filters the list by client', async () => {
    const wrapper = await mount(JobsPanel)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="jobs-client-filter"]').exists()).toBe(true))
    expect(wrapper.findAll('[data-testid="job-client"]').map((node) => node.text())).toEqual(['Per Acme Spa', 'Per Acme Spa, riservato'])
    expect(wrapper.findAll('[data-testid="jobs-client-filter"] option').map((option) => option.text())).toEqual(['Tutti i clienti', 'Acme Spa', 'Beta (archiviato)'])
    await wrapper.find('[data-testid="jobs-client-filter"]').setValue('c1')
    await vi.waitFor(() => expect(state.jobQueries.at(-1)).toMatchObject({ clientId: 'c1', page: '1' }))
  })

  it('shows nothing about clients when the organization does not recruit for them', async () => {
    state.on = false
    const jobs = await mount(JobsPanel)
    await vi.waitFor(() => expect(jobs.findAll('[data-testid="job-row"]').length).toBe(3))
    expect(jobs.find('[data-testid="jobs-client-filter"]').exists()).toBe(false)
    expect(jobs.find('[data-testid="job-client"]').exists()).toBe(false)
    const reports = await mount(ReportsPanel)
    expect(reports.find('[data-testid="report-client"]').exists()).toBe(false)
  })

  it('narrows the reports and their CSV to a client', async () => {
    const wrapper = await mount(ReportsPanel)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="report-client"]').exists()).toBe(true))
    await wrapper.find('[data-testid="report-client"]').setValue('c1')
    await vi.waitFor(() => expect(state.reportQueries.at(-1)).toMatchObject({ clientId: 'c1' }))
    expect(wrapper.find('[data-testid="report-export"]').attributes('href')).toContain('clientId=c1')
  })

  it('adds the shortlist tab only on a client job', async () => {
    const plain = await mount(JobTabs, { jobId: 'j1', current: 'ad' })
    await flushPromises()
    expect(plain.find('[data-testid="tab-shortlists"]').exists()).toBe(false)
    clearNuxtData()
    state.jobClient = { id: 'c1', name: 'Acme Spa', archived: false }
    const tabs = await mount(JobTabs, { jobId: 'j1', current: 'ad' })
    await vi.waitFor(() => expect(tabs.find('[data-testid="tab-shortlists"]').attributes('href')).toBe('/app/jobs/j1/shortlists'))
  })
})
