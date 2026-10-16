import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { ApplicationTimelineDto } from '@candydati/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detail } from '~~/test/fixtures/candidate-fixtures'
import { ok } from '~~/test/fixtures/job-fixtures'
import ApplicationTimeline from './ApplicationTimeline.vue'

const state = vi.hoisted(() => ({ value: null as unknown, urls: [] as string[] }))
registerEndpoint('/api/v1/applications/a1/timeline', {
  method: 'GET',
  handler: (event) => {
    state.urls.push(event.path)
    return ok(state.value)
  },
})

const at = (day: number) => `2026-05-0${day}T09:00:00.000Z`
const timeline = (): ApplicationTimelineDto => ({
  items: [
    { kind: 'received', id: 'r', at: at(1), actor: { type: 'candidate', name: null }, fromPreviousSystem: false, source: 'careers_page', origin: 'linkedin', campaign: 'spring', stageId: 'received' },
    { kind: 'stage_moved', id: 's', at: at(2), actor: { type: 'person', name: null }, fromPreviousSystem: true, fromStageId: 'received', toStageId: 'stage-0' },
    { kind: 'note', id: 'n', at: at(3), actor: { type: 'person', name: 'Rita Rossi' }, fromPreviousSystem: false, excerpt: 'Colloquio positivo' },
    { kind: 'decided', id: 'd', at: at(4), actor: null, fromPreviousSystem: false, outcome: 'hired' },
  ],
})

const mounted: { unmount: () => void }[] = []
const mountTimeline = async (viaJobId: string | null = null) => {
  const application = detail().applications[0]!
  const wrapper = await mountSuspended(ApplicationTimeline, { props: { applicationId: 'a1', stages: application.stages, viaJobId }, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
beforeEach(() => {
  state.value = timeline()
  state.urls = []
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('Application timeline', () => {
  it('lists the entries in the order the api sends them, as a list with time elements', async () => {
    const wrapper = await mountTimeline()
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="timeline-item"]')).toHaveLength(4))
    const list = wrapper.find('ol')
    expect(list.exists()).toBe(true)
    expect(wrapper.findAll('li')).toHaveLength(4)
    expect(wrapper.findAll('[data-kind]').map((el) => el.attributes('data-kind'))).toEqual(['received', 'stage_moved', 'note', 'decided'])
    expect(wrapper.findAll('time').map((el) => el.attributes('datetime'))).toEqual([at(1), at(2), at(3), at(4)])
    expect(wrapper.text()).toContain('Rita Rossi')
    expect(wrapper.text()).toContain('Colloquio positivo')
    expect(wrapper.text()).toContain('spring')
  })

  it('marks what came from the previous system, and only that', async () => {
    const wrapper = await mountTimeline()
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="timeline-item"]')).toHaveLength(4))
    expect(wrapper.findAll('[data-testid="timeline-previous"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="timeline-item"]')[1]!.find('[data-testid="timeline-previous"]').exists()).toBe(true)
  })

  it('shows no score, rank or recommendation', async () => {
    const wrapper = await mountTimeline()
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="timeline-item"]')).toHaveLength(4))
    expect(wrapper.text().toLowerCase()).not.toMatch(/score|punteggio|rating|ranking/)
  })

  it('passes the pipeline the profile is opened from', async () => {
    await mountTimeline('job 1')
    await vi.waitFor(() => expect(state.urls.some((url) => url.includes('viaJobId=job%201'))).toBe(true))
  })
})
