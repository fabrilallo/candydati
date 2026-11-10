import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publicInterview, SLOTS } from '~~/test/fixtures/interview-fixtures'
import { ok } from '~~/test/fixtures/job-fixtures'
import Page from './[token].vue'

const NEW_TOKEN = 'new-token-0123456789'
const conflict = (message: string) => ({ success: false, data: null, error: { code: 'conflict', message } })
const state = vi.hoisted(() => ({
  views: {} as Record<string, unknown>,
  books: [] as { token: string; body: unknown }[],
  cancels: [] as string[],
  bookConflict: null as string | null,
}))
for (const token of ['good-token-0123456789', 'new-token-0123456789', 'bad-token-0123456789']) {
  registerEndpoint(`/api/v1/public/interviews/${token}`, {
    method: 'GET',
    handler: (event) => {
      const view = state.views[token]
      if (!view) {
        setResponseStatus(event, 404)
        return { success: false, data: null, error: { code: 'not_found', message: 'This link is not valid.' } }
      }
      return ok(view)
    },
  })
  registerEndpoint(`/api/v1/public/interviews/${token}/book`, {
    method: 'POST',
    handler: async (event) => {
      const body = (await readBody(event)) as { slot: string }
      state.books.push({ token, body })
      if (state.bookConflict) {
        setResponseStatus(event, 409)
        return conflict(state.bookConflict)
      }
      state.views[NEW_TOKEN] = publicInterview({ status: 'booked', startsAt: body.slot, location: 'https://meet.example/abc', slots: SLOTS.filter((slot) => slot !== body.slot) })
      return ok({ status: 'booked', startsAt: body.slot, endsAt: body.slot, token: NEW_TOKEN })
    },
  })
  registerEndpoint(`/api/v1/public/interviews/${token}/cancel`, {
    method: 'POST',
    handler: () => {
      state.cancels.push(token)
      return ok({ status: 'cancelled' })
    },
  })
}

const mounted: { unmount: () => void }[] = []
const mountPage = async (path: string) => {
  const wrapper = await mountSuspended(Page, { route: path, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
const ready = async (wrapper: Awaited<ReturnType<typeof mountPage>>) => {
  await vi.waitFor(() => expect(wrapper.find('[data-testid="interview-page"]').exists()).toBe(true))
}
beforeEach(() => {
  state.views = { 'good-token-0123456789': publicInterview() }
  state.books = []
  state.cancels = []
  state.bookConflict = null
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('public interview page', () => {
  it('shows the interview and the free times grouped by day in the browser zone', async () => {
    const wrapper = await mountPage('/interview/good-token-0123456789')
    await ready(wrapper)
    expect(wrapper.find('[data-testid="interview-organization"]').text()).toBe('Acme Studio')
    expect(wrapper.find('[data-testid="interview-job"]').text()).toBe('Backend developer')
    expect(wrapper.find('[data-testid="interview-stage"]').text()).toBe('Colloquio tecnico')
    expect(wrapper.find('[data-testid="interview-duration"]').text()).toBe('45 minuti')
    expect(wrapper.find('[data-testid="interview-mode"]').text()).toBe('Video')
    expect(wrapper.find('[data-testid="interview-with"]').text()).toBe('Luca, Sara')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="interview-slots"]').exists()).toBe(true))
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(wrapper.find('[data-testid="interview-zone"]').text()).toContain(zone.replaceAll('_', ' '))
    expect(wrapper.findAll('fieldset').length).toBeGreaterThanOrEqual(2)
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(3)
    expect((wrapper.find('[data-testid="interview-confirm"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('preselects the time of the email link but never books on load', async () => {
    const wrapper = await mountPage(`/interview/good-token-0123456789?slot=${encodeURIComponent(SLOTS[1]!)}`)
    await ready(wrapper)
    await vi.waitFor(() => expect((wrapper.find(`[data-testid="interview-slot-${SLOTS[1]}"]`).element as HTMLInputElement).checked).toBe(true))
    expect(wrapper.find('[data-testid="interview-chosen"]').text()).toContain('Hai scelto')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(state.books).toEqual([])
  })

  it('says when the time of the email link is no longer free', async () => {
    const wrapper = await mountPage('/interview/good-token-0123456789?slot=2026-11-20T08:00:00.000Z')
    await ready(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="interview-preselected-gone"]').exists()).toBe(true))
    expect(wrapper.findAll('input[type="radio"]:checked')).toHaveLength(0)
  })

  it('books on Confirm, continues on the new link and offers to move or cancel', async () => {
    const replace = vi.spyOn(window.history, 'replaceState')
    const wrapper = await mountPage('/interview/good-token-0123456789')
    await ready(wrapper)
    await vi.waitFor(() => expect(wrapper.find(`[data-testid="interview-slot-${SLOTS[0]}"]`).exists()).toBe(true))
    await wrapper.find(`[data-testid="interview-slot-${SLOTS[0]}"]`).trigger('change')
    await wrapper.find('[data-testid="interview-confirm"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="interview-booked"]').exists()).toBe(true))
    expect(state.books).toEqual([{ token: 'good-token-0123456789', body: { slot: SLOTS[0] } }])
    expect(replace).toHaveBeenCalledWith(expect.anything(), '', `/interview/${NEW_TOKEN}`)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="interview-booked-where"]').text()).toContain('meet.example'))
    expect(wrapper.find('[data-testid="interview-move"]').exists()).toBe(true)
    await wrapper.find('[data-testid="interview-cancel"]').trigger('click')
    expect(state.cancels).toEqual([])
    await wrapper.find('[data-testid="interview-cancel-yes"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="interview-cancelled"]').exists()).toBe(true))
    expect(state.cancels).toEqual([NEW_TOKEN])
    replace.mockRestore()
  })

  it('refreshes the times and says so when the chosen one was just taken', async () => {
    state.bookConflict = 'slot_taken'
    const wrapper = await mountPage('/interview/good-token-0123456789')
    await ready(wrapper)
    await vi.waitFor(() => expect(wrapper.find(`[data-testid="interview-slot-${SLOTS[0]}"]`).exists()).toBe(true))
    state.views['good-token-0123456789'] = publicInterview({ slots: SLOTS.slice(1) })
    await wrapper.find(`[data-testid="interview-slot-${SLOTS[0]}"]`).trigger('change')
    await wrapper.find('[data-testid="interview-confirm"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="interview-notice"]').attributes('data-notice')).toBe('slotTaken'))
    expect(wrapper.find('[data-testid="interview-notice"]').text()).toContain('appena stato preso')
    await vi.waitFor(() => expect(wrapper.findAll('input[type="radio"]')).toHaveLength(2))
    expect(wrapper.findAll('input[type="radio"]:checked')).toHaveLength(0)
  })

  it('says it is too late to change and shows the booked time without choices', async () => {
    state.bookConflict = 'too_late_to_change'
    state.views['good-token-0123456789'] = publicInterview({ status: 'booked', startsAt: SLOTS[0] })
    const wrapper = await mountPage('/interview/good-token-0123456789')
    await ready(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="interview-move"]').exists()).toBe(true))
    await wrapper.find('[data-testid="interview-move"]').trigger('click')
    state.views['good-token-0123456789'] = publicInterview({ status: 'booked', startsAt: SLOTS[0], canChange: false, slots: [] })
    await wrapper.find(`[data-testid="interview-slot-${SLOTS[2]}"]`).trigger('change')
    await wrapper.find('[data-testid="interview-confirm"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="interview-notice"]').attributes('data-notice')).toBe('tooLate'))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="interview-slots"]').exists()).toBe(false))
    expect(state.books).toEqual([{ token: 'good-token-0123456789', body: { slot: SLOTS[2] } }])
    expect(wrapper.find('[data-testid="interview-cutoff"]').exists()).toBe(true)
  })

  it('shows a booked interview too close to change without move or cancel', async () => {
    state.views['good-token-0123456789'] = publicInterview({ status: 'booked', startsAt: SLOTS[0], canChange: false, slots: [] })
    const wrapper = await mountPage('/interview/good-token-0123456789')
    await ready(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="interview-cutoff"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="interview-move"]').exists()).toBe(false)
  })

  it('says a cancelled interview is cancelled', async () => {
    state.views['good-token-0123456789'] = publicInterview({ status: 'cancelled', canChange: false, slots: [] })
    const wrapper = await mountPage('/interview/good-token-0123456789')
    await ready(wrapper)
    expect(wrapper.find('[data-testid="interview-cancelled"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="interview-slots"]').exists()).toBe(false)
  })

  it('says the link is not valid, like the feedback page', async () => {
    const wrapper = await mountPage('/interview/bad-token-0123456789')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="interview-failure"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="interview-failure"]').attributes('data-failure')).toBe('invalid')
    expect(wrapper.text()).toContain('Link non valido')
  })
})
