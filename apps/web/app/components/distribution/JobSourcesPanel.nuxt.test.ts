import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import type { ReportsDto } from '@candydati/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportsFixture } from '~~/test/fixtures/phase10-fixtures'
import JobSourcesPanel from './JobSourcesPanel.vue'

const state = vi.hoisted(() => ({ report: null as ReportsDto | null, queries: [] as Record<string, unknown>[] }))
registerEndpoint('/api/v1/reports', (event) => {
  state.queries.push(getQuery(event))
  return { success: true, data: state.report, error: null }
})

const mounted: { unmount: () => void }[] = []
beforeEach(() => {
  state.report = reportsFixture()
  state.queries = []
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('JobSourcesPanel', () => {
  it('asks for the figures of this ad only and shows visits, conversion and campaigns', async () => {
    const wrapper = await mountSuspended(JobSourcesPanel, { props: { jobId: 'job-1' }, attachTo: document.body })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="source-row"]').length).toBeGreaterThan(0))
    expect(state.queries[0]).toMatchObject({ jobId: 'job-1' })
    expect(wrapper.find('[data-testid="source-visits"]').text()).toContain('160 visite')
    expect(wrapper.findAll('[data-testid="campaign-row"]')).toHaveLength(2)
  })
})
