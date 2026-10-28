import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import type { ReportsDto } from '@candydati/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { reportsFixture } from '~~/test/fixtures/phase10-fixtures'
import JobSourcesPanel from './JobSourcesPanel.vue'

const state = vi.hoisted(() => ({ report: null as ReportsDto | null, queries: [] as Record<string, unknown>[] }))
registerEndpoint('/api/v1/reports', (event) => {
  state.queries.push(getQuery(event))
  return { success: true, data: state.report, error: null }
})

/** The page in small: the figures read once with `useJobSources` and handed to the panel. */
const Host = defineComponent({
  props: { enabled: { type: Boolean, default: true } },
  setup(props) {
    const sources = useJobSources('job-1', () => props.enabled)
    return () => h(JobSourcesPanel, { report: sources.report.value, errorKey: sources.errorKey.value, loading: sources.loading.value, onRetry: () => sources.refresh() })
  },
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
    const wrapper = await mountSuspended(Host, { attachTo: document.body })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="source-row"]').length).toBeGreaterThan(0))
    expect(state.queries[0]).toMatchObject({ jobId: 'job-1' })
    expect(wrapper.find('[data-testid="source-visits"]').text()).toContain('160 visite')
    expect(wrapper.findAll('[data-testid="campaign-row"]')).toHaveLength(2)
  })

  it('asks nothing without access to the reports', async () => {
    const wrapper = await mountSuspended(Host, { props: { enabled: false }, attachTo: document.body })
    mounted.push(wrapper)
    expect(state.queries).toHaveLength(0)
    expect(wrapper.find('[data-testid="source-row"]').exists()).toBe(false)
  })

  it('says when the figures could not be loaded and tries again', async () => {
    const wrapper = await mountSuspended(JobSourcesPanel, { props: { report: null, errorKey: 'errors.generic', loading: false }, attachTo: document.body })
    mounted.push(wrapper)
    await wrapper.find('[data-testid="job-sources-error"] button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
