import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import { calendarFeed, notConnected } from '~~/test/fixtures/interview-fixtures'
import CalendarFeedPanel from './CalendarFeedPanel.vue'

const URL_SECRET = 'https://calendar.google.com/calendar/ical/secret-abc/basic.ics'
const state = vi.hoisted(() => ({ feed: null as unknown, calls: [] as { method: string; body: unknown }[], fail: null as string | null }))
registerEndpoint('/api/v1/me/calendar-feed', async (event) => {
  const method = event.method
  const body = method === 'GET' || method === 'DELETE' ? null : await readBody(event)
  state.calls.push({ method, body })
  if (state.fail && method === 'PUT') {
    setResponseStatus(event, 422)
    return { success: false, data: null, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'url', message: state.fail }] } }
  }
  if (method === 'DELETE') state.feed = notConnected()
  if (method === 'PUT' || method === 'PATCH') state.feed = calendarFeed({ ...(body as object), fetchedAt: new Date().toISOString() })
  return ok(state.feed)
})

const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  const wrapper = await mountSuspended(CalendarFeedPanel, { attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="calendar-status"]').exists()).toBe(true))
  return wrapper
}
const writes = () => state.calls.filter((call) => call.method !== 'GET')
beforeEach(() => {
  state.feed = notConnected()
  state.calls = []
  state.fail = null
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('calendar settings', () => {
  it('connects a calendar with the pasted address and the working hours, then never shows the address back', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="calendar-not-connected"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="calendar-privacy"]').text()).toContain('Mai titoli')
    expect(wrapper.find('[data-testid="calendar-how-to-google"]').text()).toContain('Indirizzo segreto in formato iCal')
    expect(wrapper.find('[data-testid="calendar-how-to-outlook"]').text()).toContain('Può visualizzare quando sono occupato')
    const input = wrapper.find('[data-testid="calendar-url"]')
    expect(input.attributes('type')).toBe('url')
    await input.setValue(URL_SECRET)
    await wrapper.find('[data-testid="calendar-hours-day-6"]').setValue(true)
    await wrapper.find('[data-testid="calendar-hours-zone"]').setValue('Europe/London')
    await wrapper.find('[data-testid="calendar-url-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="calendar-host"]').exists()).toBe(true))
    expect(writes()).toEqual([{ method: 'PUT', body: { url: URL_SECRET, timeZone: 'Europe/London', workingHours: { days: [1, 2, 3, 4, 5, 6], start: '09:00', end: '18:00' } } }])
    expect(wrapper.find('[data-testid="calendar-host"]').text()).toContain('calendar.google.com')
    expect(wrapper.find('[data-testid="calendar-age"]').text()).toContain('aggiornato ora')
    expect((wrapper.find('[data-testid="calendar-url"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.html()).not.toContain('secret-abc')
  })

  it('explains in plain words why a link was refused', async () => {
    state.fail = 'calendar_not_calendar'
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="calendar-url"]').setValue(URL_SECRET)
    await wrapper.find('[data-testid="calendar-url-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('non porta a un calendario in formato iCal'))
  })

  it('refuses an http address before sending it', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="calendar-url"]').setValue('http://example.com/cal.ics')
    await wrapper.find('[data-testid="calendar-url-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('https://'))
    expect(writes()).toEqual([])
  })

  it('shows the last error of a connected calendar and changes the hours without the address', async () => {
    state.feed = calendarFeed({ lastError: 'unreachable', fetchedAt: new Date(Date.now() - 12 * 60_000).toISOString() })
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="calendar-age"]').text()).toContain('12 min fa')
    expect(wrapper.find('[data-testid="calendar-last-error"]').text()).toContain('rigenerato')
    await wrapper.find('[data-testid="calendar-hours-start"]').setValue('10:00')
    await wrapper.find('[data-testid="calendar-hours-form"]').trigger('submit')
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ method: 'PATCH', body: { timeZone: 'Europe/Rome', workingHours: { days: [1, 2, 3, 4, 5], start: '10:00', end: '18:00' } } })
  })

  it('disconnects after an in-app confirmation', async () => {
    state.feed = calendarFeed()
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="calendar-disconnect"]').trigger('click')
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="confirm"]')).not.toBeNull())
    ;(document.body.querySelector('[data-testid="confirm"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="calendar-not-connected"]').exists()).toBe(true))
    expect(writes().map((call) => call.method)).toEqual(['DELETE'])
  })
})
