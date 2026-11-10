import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detail } from '~~/test/fixtures/candidate-fixtures'
import { interviewView } from '~~/test/fixtures/interview-fixtures'
import { ok } from '~~/test/fixtures/job-fixtures'
import InterviewsPanel from './InterviewsPanel.vue'

const state = vi.hoisted(() => ({
  list: [] as unknown[],
  proposals: [] as unknown[],
  cancels: [] as string[],
  result: { freeSlots: 8, withoutCalendar: [] as string[] },
  conflict: false,
}))
registerEndpoint('/api/v1/applications/a1/interviews', async (event) => {
  if (event.method === 'GET') return ok(state.list)
  state.proposals.push(await readBody(event))
  if (state.conflict) {
    setResponseStatus(event, 409)
    return { success: false, data: null, error: { code: 'conflict', message: 'An open interview exists at this stage.' } }
  }
  const created = interviewView({ id: `i${state.proposals.length + 1}` })
  state.list = [created, ...state.list]
  setResponseStatus(event, 201)
  return ok({ interview: created, ...state.result })
})
registerEndpoint('/api/v1/interviews/i1/cancel', { method: 'POST', handler: () => {
  state.cancels.push('i1')
  state.list = state.list.map((item) => ({ ...(item as object), status: 'cancelled' }))
  return ok(interviewView({ status: 'cancelled' }))
} })

const mounted: { unmount: () => void }[] = []
const mountPanel = async (canSchedule = true) => {
  const wrapper = await mountSuspended(InterviewsPanel, { props: { application: detail().applications[0]!, canSchedule }, attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="interviews-empty"], [data-testid="interview-item"]').exists()).toBe(true))
  return wrapper
}
const inBody = <T extends Element>(selector: string): T | null => document.body.querySelector<T>(selector)
const openAndSubmit = async (wrapper: Awaited<ReturnType<typeof mountPanel>>, setup?: () => Promise<void> | void) => {
  await wrapper.find('[data-testid="interviews-propose"]').trigger('click')
  await vi.waitFor(() => expect(inBody('[data-testid="propose-interview-form"]')).not.toBeNull())
  await setup?.()
  inBody<HTMLFormElement>('[data-testid="propose-interview-form"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}
const choose = (selector: string, value: string): void => {
  const field = inBody<HTMLInputElement | HTMLSelectElement>(selector)!
  field.value = value
  field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

beforeEach(() => {
  state.list = []
  state.proposals = []
  state.cancels = []
  state.result = { freeSlots: 8, withoutCalendar: [] }
  state.conflict = false
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('Interviews tab', () => {
  it('lists interviews with their state, time, length, mode and interviewers', async () => {
    state.list = [
      interviewView({ status: 'booked', startsAt: '2026-11-16T08:00:00.000Z', endsAt: '2026-11-16T08:45:00.000Z', location: 'https://meet.example/abc' }),
      interviewView({ id: 'i0', status: 'cancelled', mode: 'phone' }),
    ]
    const wrapper = await mountPanel()
    const items = wrapper.findAll('[data-testid="interview-item"]')
    expect(items.map((item) => item.attributes('data-status'))).toEqual(['booked', 'cancelled'])
    expect(items[0]!.find('[data-testid="interview-status"]').text()).toBe('Fissato')
    expect(items[0]!.find('[data-testid="interview-when"]').text()).toMatch(/16 novembre/)
    expect(items[0]!.find('[data-testid="interview-meta"]').text()).toContain('45 min · Video · Con Luca Bianchi')
    expect(items[0]!.find('[data-testid="interview-location"]').text()).toContain('meet.example')
    expect(items[1]!.find('[data-testid="interview-cancel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="interviews-zone"]').exists()).toBe(true)
  })

  it('proposes an interview at the current stage and says the candidate gets the free times', async () => {
    const wrapper = await mountPanel()
    await openAndSubmit(wrapper, async () => {
      expect(inBody<HTMLSelectElement>('[data-testid="propose-interview-stage"]')!.value).toBe('stage-0')
      expect([...inBody<HTMLSelectElement>('[data-testid="propose-interview-stage"]')!.options].map((option) => option.value)).toEqual(['stage-0', 'stage-1'])
      choose('[data-testid="propose-interview-mode"]', 'onsite')
      await nextTick()
      choose('[data-testid="propose-interview-location"]', 'Via Roma 1, Milano')
    })
    await vi.waitFor(() => expect(wrapper.find('[data-testid="interviews-notices"]').exists()).toBe(true))
    expect(state.proposals).toEqual([{ stageId: 'stage-0', mode: 'onsite', location: 'Via Roma 1, Milano' }])
    expect(wrapper.find('[data-testid="interviews-notice-success"]').text()).toContain("Il candidato riceve un'email con gli orari liberi")
    expect(wrapper.find('[data-testid="interviews-notice-warning"]').exists()).toBe(false)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="interview-item"]')).toHaveLength(1))
  })

  it('warns when an interviewer has no calendar and when no time is free', async () => {
    state.result = { freeSlots: 0, withoutCalendar: ['Luca'] }
    const wrapper = await mountPanel()
    await openAndSubmit(wrapper)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="interviews-notice-warning"]')).toHaveLength(2))
    const warnings = wrapper.findAll('[data-testid="interviews-notice-warning"]').map((item) => item.text())
    expect(warnings[0]).toBe('Luca non ha collegato il calendario: contiamo libere le sue ore lavorative.')
    expect(warnings[1]).toContain('nessun orario libero')
  })

  it('says an open interview already exists at that stage', async () => {
    state.conflict = true
    const wrapper = await mountPanel()
    await openAndSubmit(wrapper)
    await vi.waitFor(() => expect(inBody('[data-testid="propose-interview-form"]')?.textContent).toContain('già un colloquio aperto'))
    expect(wrapper.find('[data-testid="interviews-notices"]').exists()).toBe(false)
  })

  it('cancels an open interview only after an in-app confirmation', async () => {
    state.list = [interviewView()]
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="interview-cancel"]').trigger('click')
    await vi.waitFor(() => expect(inBody('[data-testid="confirm"]')).not.toBeNull())
    expect(state.cancels).toEqual([])
    inBody<HTMLButtonElement>('[data-testid="confirm"]')!.click()
    await vi.waitFor(() => expect(state.cancels).toEqual(['i1']))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="interview-item"]').attributes('data-status')).toBe('cancelled'))
    expect(confirmSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('offers no proposal nor cancel to who only reads', async () => {
    state.list = [interviewView()]
    const wrapper = await mountPanel(false)
    expect(wrapper.find('[data-testid="interviews-propose"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="interview-cancel"]').exists()).toBe(false)
  })
})
