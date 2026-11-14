import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import GoogleCalendarPanel from './GoogleCalendarPanel.vue'

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('vue-sonner', () => ({ toast: toasts }))

const nav = vi.hoisted(() => ({ query: {} as Record<string, string> }))
mockNuxtImport('useRoute', () => () => ({ query: nav.query }))

type Connection = {
  provider: 'google'
  accountEmail: string
  status: 'active' | 'broken'
  connectedAt: string
  timeZone: string
  workingHours: { days: number[]; start: string; end: string }
  fetchedAt: string | null
  lastError: 'revoked' | 'unreachable' | 'refused' | null
}
const state = vi.hoisted(() => ({ available: true, connection: null as Connection | null, calls: [] as string[], hours: [] as unknown[] }))
registerEndpoint('/api/v1/me/calendar/google', async (event) => {
  state.calls.push(event.method)
  if (event.method === 'DELETE') {
    state.connection = null
    return ok({ removed: true })
  }
  return ok({ available: state.available, connection: state.connection })
})
registerEndpoint('/api/v1/me/calendar-feed', async (event) => {
  const body = (await readBody(event)) as { timeZone: string; workingHours: Connection['workingHours'] }
  state.hours.push(body)
  if (state.connection) state.connection = { ...state.connection, ...body }
  return ok({ connected: false, host: null, timeZone: null, workingHours: body.workingHours, fetchedAt: null, lastError: null })
})

const connected = (status: Connection['status'] = 'active', overrides: Partial<Connection> = {}): Connection => ({
  provider: 'google',
  accountEmail: 'anna@example.com',
  status,
  connectedAt: '2026-11-12T10:00:00.000Z',
  timeZone: 'Europe/Rome',
  workingHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
  fetchedAt: null,
  lastError: null,
  ...overrides,
})

const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  const wrapper = await mountSuspended(GoogleCalendarPanel, { attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
beforeEach(() => {
  state.available = true
  state.connection = null
  state.calls = []
  state.hours = []
  toasts.success.mockClear()
  toasts.error.mockClear()
  nav.query = {}
  clearNuxtData()
  clearNuxtState()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('Google Calendar in the calendar settings', () => {
  it('offers to connect with a link to the api, which sends the person to Google', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="google-calendar-connect"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="google-calendar-connect"]').attributes('href')).toBe('/api/v1/me/calendar/google/start')
    expect(wrapper.text()).toContain('Collega Google Calendar')
  })

  it('is not shown when the instance has no Google app', async () => {
    state.available = false
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(state.calls).toContain('GET'))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="google-calendar-panel"]').exists()).toBe(false))
  })

  it('shows who is connected and disconnects', async () => {
    state.connection = connected()
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="google-calendar-account"]').text()).toContain('anna@example.com'))
    expect(wrapper.find('[data-testid="google-calendar-reconnect"]').exists()).toBe(false)
    await wrapper.find('[data-testid="google-calendar-disconnect"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="google-calendar-connect"]').exists()).toBe(true))
    expect(state.calls).toContain('DELETE')
  })

  it('asks to connect again when Google no longer accepts the connection', async () => {
    state.connection = connected('broken')
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="google-calendar-broken"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="google-calendar-reconnect"]').attributes('href')).toBe('/api/v1/me/calendar/google/start')
  })

  it('tells the outcome of the round trip once, then drops it from the address', async () => {
    nav.query = { google: 'missing_scope', tab: 'x' }
    const replace = vi.spyOn(useRouter(), 'replace').mockResolvedValue(undefined)
    await mountPanel()
    await vi.waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Servono entrambi i permessi sul calendario: riprova e lascia spunte le due caselle.'))
    expect(replace).toHaveBeenCalledWith({ query: { tab: 'x' } })
    replace.mockRestore()
    expect(toasts.error).toHaveBeenCalledTimes(1)
  })

  it('ignores an outcome it does not know', async () => {
    nav.query = { google: '<b>' }
    const replace = vi.spyOn(useRouter(), 'replace').mockResolvedValue(undefined)
    await mountPanel()
    await vi.waitFor(() => expect(state.calls).toContain('GET'))
    expect(toasts.error).not.toHaveBeenCalled()
    expect(toasts.success).not.toHaveBeenCalled()
    // Nuxt's own navigation may replace the route; the panel never rewrites the query for an unknown outcome.
    expect(replace.mock.calls.filter(([to]) => typeof to === 'object' && to !== null && 'query' in to)).toEqual([])
    replace.mockRestore()
  })

  it('holds the working hours: saved for the person, shared with the iCal link', async () => {
    state.connection = connected()
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="google-calendar-hours-form"]').exists()).toBe(true))
    await wrapper.find('[data-testid="google-calendar-hours-form"]').trigger('submit')
    await vi.waitFor(() => expect(state.hours).toEqual([{ timeZone: 'Europe/Rome', workingHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' } }]))
    await vi.waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Orari salvati'))
  })

  it('says when the last read from Google failed', async () => {
    state.connection = connected('active', { lastError: 'unreachable' })
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="google-calendar-last-error"]').text()).toContain('Google non risponde'))
  })
})
