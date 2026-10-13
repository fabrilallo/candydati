import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeJob, ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import DistributionSettings from './DistributionSettings.vue'
import JobDistributionPanel from './JobDistributionPanel.vue'

const state = vi.hoisted(() => ({ syncs: 0, puts: [] as unknown[], channels: [] as unknown[], overview: [] as unknown[] }))
registerEndpoint('/api/v1/jobs/job-1/distribution', () => ok(state.channels))
registerEndpoint('/api/v1/jobs/job-1/distribution/sync', { method: 'POST', handler: () => (state.syncs += 1, ok({ queued: true })) })
registerEndpoint('/api/v1/distribution', () => ok({ feedUrl: 'x', llmsTxtUrl: 'y', channels: state.overview }))
registerEndpoint('/api/v1/distribution/channels/board', async (event) => {
  const body = await readBody<{ enabled: boolean }>(event)
  state.puts.push(body)
  return ok({ channelId: 'board', label: 'Board', enabled: body.enabled, builtIn: false })
})

const mounted: { unmount: () => void }[] = []
const job = makeJob({ id: 'job-1', slug: 'backend-1', status: 'published' })
beforeEach(() => {
  state.syncs = 0
  state.puts.length = 0
  state.channels = [{ channelId: 'feed', label: 'Feed XML', status: 'published', url: null, error: null, updatedAt: '2026-10-13T09:00:00.000Z' }]
  state.overview = [{ channelId: 'feed', label: 'Feed XML', builtIn: true, enabled: true }]
  clearNuxtData()
  useViewer().viewer.value = viewerWith('admin')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('job distribution tab', () => {
  it('without registered channels shows the feed and the public API with copyable urls, and no sync button', async () => {
    const wrapper = await mountSuspended(JobDistributionPanel, { props: { job }, attachTo: document.body })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="distribution-row"]').length).toBe(2))
    const text = wrapper.text()
    expect(text).toContain('Nel feed XML')
    expect(wrapper.find('[data-channel="api"]').text()).toContain('/api/v1/public/organizations/')
    expect(wrapper.find('[data-channel="feed"] [data-testid="distribution-url"]').text()).toContain('/jobs.xml')
    expect(wrapper.find('[data-testid="distribution-no-channels"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="distribution-sync"]').exists()).toBe(false)
  })

  it('shows a registered channel with status, link and error, and syncs again', async () => {
    state.channels = [
      ...state.channels,
      { channelId: 'board', label: 'Board', status: 'failed', url: 'https://board.example/1', error: 'timeout', updatedAt: '2026-10-13T10:00:00.000Z' },
    ]
    const wrapper = await mountSuspended(JobDistributionPanel, { props: { job }, attachTo: document.body })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-channel="board"]').exists()).toBe(true))
    const row = wrapper.find('[data-channel="board"]')
    expect(row.text()).toContain('Errore')
    expect(row.text()).toContain('timeout')
    expect(row.find('a').attributes('href')).toBe('https://board.example/1')
    expect(wrapper.find('[data-testid="distribution-no-channels"]').exists()).toBe(false)
    await wrapper.find('[data-testid="distribution-sync"]').trigger('click')
    await vi.waitFor(() => expect(state.syncs).toBe(1))
  })
})

describe('distribution settings', () => {
  it('lists the addresses and shows an empty state when only the feed exists', async () => {
    const wrapper = await mountSuspended(DistributionSettings, { attachTo: document.body })
    mounted.push(wrapper)
    for (const id of ['url-feed', 'url-llms', 'url-sitemap', 'url-api']) expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(true)
    expect(wrapper.find('[data-testid="url-curl"]').text()).toContain('curl')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="channels-empty"]').exists()).toBe(true))
  })

  it('switches a registered channel off', async () => {
    state.overview = [...state.overview, { channelId: 'board', label: 'Board', builtIn: false, enabled: true }]
    const wrapper = await mountSuspended(DistributionSettings, { attachTo: document.body })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="channel-item"]').length).toBe(1))
    await wrapper.find('[data-testid="channel-toggle"]').trigger('click')
    await vi.waitFor(() => expect(state.puts).toEqual([{ enabled: false }]))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="channel-toggle"]').attributes('aria-checked')).toBe('false'))
  })
})
