import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { viewerWith } from '~~/test/fixtures/job-fixtures'
import { notification } from '~~/test/fixtures/phase4-fixtures'
import AppNavPanel from '../app/AppNavPanel.vue'
import AppTopBar from '../app/AppTopBar.vue'

const state = vi.hoisted(() => ({ unread: 3, reads: [] as unknown[], polls: 0 }))
registerEndpoint('/api/v1/notifications/unread-count', () => {
  state.polls += 1
  return { success: true, data: { count: state.unread }, error: null }
})
registerEndpoint('/api/v1/notifications', () => ({
  success: true,
  data: [notification('n1'), notification('n2', { kind: 'task_assigned', taskId: 't1', readAt: '2026-10-13T09:00:00.000Z' })],
  error: null,
}))
registerEndpoint('/api/v1/notifications/read', {
  method: 'POST',
  handler: async (event) => {
    state.reads.push(await readBody(event))
    return { success: true, data: { updated: 1 }, error: null }
  },
})
registerEndpoint('/api/v1/applications/attention', (event) => {
  const overdue = String(event.node.req.url).includes('state=overdue')
  return { success: true, data: [], error: null, meta: { total: overdue ? 2 : 3, page: 1, limit: 1 } }
})

const mounted: { unmount: () => void }[] = []
const panel = () => document.body.querySelector('[data-testid="notification-panel"]')
beforeEach(() => {
  state.unread = 3
  state.reads.length = 0
  state.polls = 0
  clearNuxtData()
  useState('notifications-unread').value = null
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
})

describe('notification bell', () => {
  it('shows the unread count and lists the notifications with wording and link', async () => {
    const wrapper = await mountSuspended(AppTopBar, { props: { crumbs: [{ label: 'Panoramica' }] }, attachTo: document.body })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="notification-badge"]').text()).toBe('3'))
    expect(wrapper.find('[data-testid="notification-bell"]').attributes('aria-label')).toBe('Notifiche, 3 da leggere')
    await wrapper.find('[data-testid="notification-bell"]').trigger('click')
    await vi.waitFor(() => expect(document.body.querySelectorAll('[data-testid="notification-item"]').length).toBe(2))
    const [first, second] = [...document.body.querySelectorAll('[data-testid="notification-item"]')]
    expect(first?.textContent).toContain('Risposta in ritardo')
    expect(first?.textContent).toContain('Giulia Rossi, Backend developer')
    expect(first?.getAttribute('href')).toBe('/app/candidates/c1?application=a1')
    expect(second?.getAttribute('href')).toBe('/app/tasks')
    expect(second?.hasAttribute('data-unread')).toBe(false)
  })

  it('marks everything as read and clears the badge', async () => {
    const wrapper = await mountSuspended(AppTopBar, { props: { crumbs: [{ label: 'Panoramica' }] }, attachTo: document.body })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="notification-badge"]').exists()).toBe(true))
    await wrapper.find('[data-testid="notification-bell"]').trigger('click')
    await vi.waitFor(() => expect(panel()?.querySelector('[data-testid="notifications-mark-all"]')).not.toBeNull())
    panel()?.querySelector<HTMLButtonElement>('[data-testid="notifications-mark-all"]')?.click()
    await vi.waitFor(() => expect(state.reads).toEqual([{ all: true }]))
    await flushPromises()
    expect(wrapper.find('[data-testid="notification-badge"]').exists()).toBe(false)
    expect(panel()?.querySelector('[data-unread]')).toBeNull()
  })

  it('marks one read when followed', async () => {
    const wrapper = await mountSuspended(AppTopBar, { props: { crumbs: [{ label: 'Panoramica' }] }, attachTo: document.body })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="notification-badge"]').text()).toBe('3'))
    await wrapper.find('[data-testid="notification-bell"]').trigger('click')
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="notification-item"]')).not.toBeNull())
    document.body.querySelector<HTMLElement>('[data-testid="notification-item"]')?.click()
    await vi.waitFor(() => expect(state.reads).toEqual([{ ids: ['n1'] }]))
    expect(wrapper.find('[data-testid="notification-badge"]').text()).toBe('2')
  })

  it('polls every minute only while the tab is visible', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const wrapper = await mountSuspended(AppTopBar, { props: { crumbs: [{ label: 'Panoramica' }] } })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(state.polls).toBe(1))
    state.unread = 5
    vi.advanceTimersByTime(60_000)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="notification-badge"]').text()).toBe('5'))
    expect(state.polls).toBe(2)
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    vi.advanceTimersByTime(180_000)
    await flushPromises()
    expect(state.polls).toBe(2)
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(state.polls).toBe(3))
  })
})

describe('sidebar count', () => {
  it('counts late and near answers on "Da gestire"', async () => {
    const wrapper = await mountSuspended(AppNavPanel)
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="nav-count-attention"]').text()).toContain('5 da gestire'))
    expect(wrapper.findAll('nav a').map((link) => link.attributes('href'))).toContain('/app/tasks')
  })
})
