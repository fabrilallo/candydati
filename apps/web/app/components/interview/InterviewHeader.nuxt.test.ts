import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { detail } from '~~/test/fixtures/candidate-fixtures'
import { interviewView } from '~~/test/fixtures/interview-fixtures'
import { ok } from '~~/test/fixtures/job-fixtures'
import InterviewHeadline from './InterviewHeadline.vue'
import ProposeInterviewButton from './ProposeInterviewButton.vue'

const state = vi.hoisted(() => ({ list: [] as unknown[], proposals: [] as unknown[] }))
registerEndpoint('/api/v1/applications/a1/interviews', async (event) => {
  if (event.method === 'GET') return ok(state.list)
  state.proposals.push(await readBody(event))
  const created = interviewView({ id: 'new' })
  state.list = [created, ...state.list]
  setResponseStatus(event, 201)
  return ok({ interview: created, freeSlots: 6, withoutCalendar: [] })
})

const application = detail().applications[0]!
const now = new Date('2026-11-11T12:00:00Z')
/** The two pieces as the candidate header has them: the line on the left, the button among the actions. */
const Header = defineComponent({
  props: { stageId: { type: String, default: undefined } },
  emits: ['show'],
  setup: (props, { emit }) => () => {
    const at = props.stageId ? { ...application, stageId: props.stageId } : application
    return h('div', [h(InterviewHeadline, { application: at, now, onShow: () => emit('show') }), h(ProposeInterviewButton, { application: at })])
  },
})
const mounted: { unmount: () => void }[] = []
const mountHeader = async (stageId?: string) => {
  const wrapper = await mountSuspended(Header, { props: { stageId }, attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="candidate-interview"], [data-testid="header-propose-interview"]').exists()).toBe(true))
  return wrapper
}
const inBody = <T extends Element>(selector: string): T | null => document.body.querySelector<T>(selector)

beforeEach(() => {
  state.list = []
  state.proposals = []
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('interview in the candidate header', () => {
  it('says when the interview is booked, and Dettagli opens the tab', async () => {
    state.list = [interviewView({ status: 'booked', startsAt: '2026-11-12T13:30:00.000Z', endsAt: '2026-11-12T14:30:00.000Z' })]
    const wrapper = await mountHeader()
    const line = wrapper.find('[data-testid="candidate-interview"]')
    expect(line.attributes('data-status')).toBe('booked')
    expect(line.text()).toMatch(/Colloquio:.*fissato .*12 novembre/)
    expect(wrapper.find('[data-testid="header-propose-interview"]').exists()).toBe(false)
    await wrapper.find('[data-testid="candidate-interview-show"]').trigger('click')
    expect(wrapper.emitted('show')).toHaveLength(1)
  })

  it('offers the proposal at once when the stage has none, and then shows it is waiting for the candidate', async () => {
    const wrapper = await mountHeader()
    expect(wrapper.find('[data-testid="candidate-interview"]').exists()).toBe(false)
    await wrapper.find('[data-testid="header-propose-interview"]').trigger('click')
    await vi.waitFor(() => expect(inBody('[data-testid="propose-interview-form"]')).not.toBeNull())
    expect(inBody<HTMLAnchorElement>('[data-testid="propose-interview-who-link"]')!.getAttribute('href')).toBe('/app/jobs/j1/automations')
    inBody<HTMLFormElement>('[data-testid="propose-interview-form"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="candidate-interview"]').exists()).toBe(true))
    expect(state.proposals).toEqual([{ stageId: 'stage-0', mode: 'video' }])
    expect(wrapper.find('[data-testid="candidate-interview"]').text()).toContain("proposto, il candidato non ha ancora scelto l'orario")
    expect(wrapper.find('[data-testid="header-propose-interview"]').exists()).toBe(false)
  })

  it('is there from Ricevute too, starting on the first interview stage', async () => {
    const wrapper = await mountHeader('received')
    await wrapper.find('[data-testid="header-propose-interview"]').trigger('click')
    await vi.waitFor(() => expect(inBody('[data-testid="propose-interview-form"]')).not.toBeNull())
    expect(inBody<HTMLSelectElement>('[data-testid="propose-interview-stage"]')!.value).toBe('stage-0')
  })
})
