import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import ScorecardEditor from './ScorecardEditor.vue'

const state = vi.hoisted(() => ({ puts: [] as unknown[], suggest: { status: 'proposed', criteria: ['Inglese B2', 'Esperienza con Postgres'] } as unknown }))
const SCORECARD = {
  jobId: 'j1',
  criteria: [
    { id: 'c1', label: 'Esperienza con Postgres', stageId: null, position: 0, locked: true },
    { id: 'c2', label: 'Design di API', stageId: 'stage-1', position: 1, locked: false },
  ],
}
registerEndpoint('/api/v1/jobs/j1/scorecard', {
  method: 'GET',
  handler: () => ok(SCORECARD),
})
registerEndpoint('/api/v1/jobs/j1/scorecard', {
  method: 'PUT',
  handler: async (event) => {
    const body = (await readBody(event)) as { criteria: { id?: string; label: string; stageId: string | null }[] }
    state.puts.push(body)
    return ok({ jobId: 'j1', criteria: body.criteria.map((item, position) => ({ id: item.id ?? `n${position}`, label: item.label, stageId: item.stageId, position, locked: item.id === 'c1' })) })
  },
})
registerEndpoint('/api/v1/jobs/j1/scorecard/suggest', { method: 'POST', handler: () => ok(state.suggest) })

const STAGES = [
  { id: 'received', declared: null },
  { id: 'stage-0', declared: { type: 'screening_call' as const, durationMinutes: 30, conductedBy: 'recruiter' as const } },
  { id: 'stage-1', declared: { type: 'technical_interview' as const, durationMinutes: 90, conductedBy: 'technical_lead' as const } },
]
const mounted: { unmount: () => void }[] = []
const mountEditor = async (canManage = true) => {
  const wrapper = await mountSuspended(ScorecardEditor, { props: { jobId: 'j1', stages: STAGES, canManage }, attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.findAll('[data-testid="criterion"]').length).toBe(2))
  return wrapper
}
beforeEach(() => {
  state.puts = []
  state.suggest = { status: 'proposed', criteria: ['Inglese B2', 'Esperienza con Postgres'] }
  clearNuxtData('job-scorecard-j1')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('ScorecardEditor', () => {
  it('offers every stage and the declared ones, never "received"', async () => {
    const wrapper = await mountEditor()
    const options = wrapper.findAll('[data-testid="criterion"]')[1]!.findAll('[data-testid="criterion-stage"] option')
    expect(options.map((option) => option.attributes('value'))).toEqual(['', 'stage-0', 'stage-1'])
    expect(options[0]?.text()).toBe('Tutte le fasi')
  })

  it('saves the whole ordered list, keeping the ids of existing criteria', async () => {
    const wrapper = await mountEditor()
    const second = wrapper.findAll('[data-testid="criterion"]')[1]!
    await second.find('[data-testid="criterion-label"]').setValue('Design di API REST')
    await wrapper.find('[data-testid="criterion-add"]').trigger('click')
    const third = wrapper.findAll('[data-testid="criterion"]')[2]!
    await third.find('[data-testid="criterion-label"]').setValue('Inglese B2')
    await third.find('[data-testid="criterion-stage"]').setValue('stage-0')
    await wrapper.findAll('[data-testid="criterion"]')[2]!.find('[data-testid="criterion-up"]').trigger('click')
    await wrapper.find('[data-testid="scorecard-save"]').trigger('click')
    await flushPromises()
    expect(state.puts).toEqual([
      {
        criteria: [
          { id: 'c1', label: 'Esperienza con Postgres', stageId: null },
          { label: 'Inglese B2', stageId: 'stage-0' },
          { id: 'c2', label: 'Design di API REST', stageId: 'stage-1' },
        ],
      },
    ])
  })

  it('keeps a locked criterion\'s words fixed, but lets it be retired', async () => {
    const wrapper = await mountEditor()
    const locked = wrapper.findAll('[data-testid="criterion"]')[0]!
    expect(locked.find('[data-testid="criterion-label"]').attributes('disabled')).toBeDefined()
    expect(locked.find('[data-testid="criterion-stage"]').attributes('disabled')).toBeDefined()
    expect(locked.find('[data-testid="criterion-locked"]').text()).toContain('feedback')
    expect(wrapper.findAll('[data-testid="criterion"]')[1]!.find('[data-testid="criterion-locked"]').exists()).toBe(false)
    await locked.find('[data-testid="criterion-remove"]').trigger('click')
    await wrapper.find('[data-testid="scorecard-save"]').trigger('click')
    await flushPromises()
    expect(state.puts).toEqual([{ criteria: [{ id: 'c2', label: 'Design di API', stageId: 'stage-1' }] }])
  })

  it('refuses an empty label before calling the api', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="criterion-add"]').trigger('click')
    await wrapper.find('[data-testid="scorecard-save"]').trigger('click')
    await flushPromises()
    expect(state.puts).toEqual([])
    expect(wrapper.find('[data-testid="criterion-error"]').text()).toContain('Scrivi')
  })

  it('drafts criteria from the ad as chips, only the new ones, and adds the one picked', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="scorecard-suggest"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="scorecard-proposal"]').length).toBeGreaterThan(0))
    const chips = wrapper.findAll('[data-testid="scorecard-proposal"]')
    expect(chips.map((chip) => chip.text())).toEqual([expect.stringContaining('Inglese B2')])
    await chips[0]!.trigger('click')
    expect(wrapper.findAll('[data-testid="criterion"]').length).toBe(3)
    expect((wrapper.findAll('[data-testid="criterion-label"]')[2]!.element as HTMLInputElement).value).toBe('Inglese B2')
    expect(wrapper.find('[data-testid="scorecard-proposal"]').exists()).toBe(false)
    expect(state.puts).toEqual([])
  })

  it('says where to turn AI on when drafting is unavailable', async () => {
    state.suggest = { status: 'unavailable' }
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="scorecard-suggest"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="scorecard-suggest-message"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="scorecard-suggest-message"]').text()).toContain('AI')
  })

  it('shows the criteria read-only to whoever cannot manage feedback', async () => {
    const wrapper = await mountEditor(false)
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.find('[data-testid="scorecard-save"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="scorecard-suggest"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Esperienza con Postgres')
    expect(wrapper.text()).toContain('Colloquio tecnico')
  })
})
