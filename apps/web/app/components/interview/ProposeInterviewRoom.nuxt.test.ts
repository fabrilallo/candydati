import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detail } from '~~/test/fixtures/candidate-fixtures'
import { interviewView } from '~~/test/fixtures/interview-fixtures'
import { ok } from '~~/test/fixtures/job-fixtures'
import InterviewsPanel from './InterviewsPanel.vue'

const ROOM = 'https://meet.google.com/hug-oman-ager'
const state = vi.hoisted(() => ({ room: null as { url: string; owner: string } | null, proposals: [] as unknown[] }))
registerEndpoint('/api/v1/applications/a1/interviews/defaults', () => ok({ interviewers: ['Hugo Manager'], videoRoom: state.room }))
registerEndpoint('/api/v1/applications/a1/interviews', async (event) => {
  if (event.method === 'GET') return ok([])
  const body = (await readBody(event)) as { location?: string }
  state.proposals.push(body)
  setResponseStatus(event, 201)
  return ok({ interview: interviewView({ location: body.location ?? null }), freeSlots: 4, withoutCalendar: [], videoRoomOf: null, withoutLink: !body.location })
})

const inBody = <T extends Element>(selector: string): T | null => document.body.querySelector<T>(selector)
const mounted: { unmount: () => void }[] = []
const openDialog = async () => {
  const wrapper = await mountSuspended(InterviewsPanel, { props: { application: detail().applications[0]!, canSchedule: true }, attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="interviews-propose"]').exists()).toBe(true))
  await wrapper.find('[data-testid="interviews-propose"]').trigger('click')
  await vi.waitFor(() => expect(inBody('[data-testid="propose-interview-who"]')?.textContent).toContain('Hugo Manager'))
  return wrapper
}
const submit = () => inBody<HTMLFormElement>('[data-testid="propose-interview-form"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
beforeEach(() => {
  state.room = null
  state.proposals = []
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('the link of a video interview', () => {
  it('is the interviewer’s room, filled in and named', async () => {
    state.room = { url: ROOM, owner: 'Hugo Manager' }
    await openDialog()
    await vi.waitFor(() => expect(inBody<HTMLInputElement>('[data-testid="propose-interview-location"]')!.value).toBe(ROOM))
    expect(inBody('[data-testid="propose-interview-room"]')?.textContent).toContain('Hugo Manager')
    expect(inBody('[data-testid="propose-interview-no-link"]')).toBeNull()
    submit()
    await vi.waitFor(() => expect(state.proposals).toEqual([{ stageId: 'stage-0', mode: 'video', location: ROOM }]))
  })

  it('is missing: the dialog says so before sending and points to the settings, and the panel after', async () => {
    const wrapper = await openDialog()
    await vi.waitFor(() => expect(inBody('[data-testid="propose-interview-no-link"]')).not.toBeNull())
    expect(inBody<HTMLAnchorElement>('[data-testid="propose-interview-no-link-settings"]')!.getAttribute('href')).toBe('/app/settings/calendar')
    submit()
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="interviews-notice-warning"]').map((item) => item.text()).join(' ')).toContain('non ha un link per la videochiamata'))
  })
})
