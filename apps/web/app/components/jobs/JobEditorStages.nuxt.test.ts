import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { card, pipeline } from '~~/test/fixtures/candidate-fixtures'
import { completeContent, makeJob, ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import JobEditor from './JobEditor.vue'

const stage = (id: string, type: 'screening_call' | 'technical_interview') => ({ id, type, durationMinutes: 30, conductedBy: 'recruiter' as const })
const published = () =>
  makeJob({ id: 'js1', status: 'published', publishedAt: '2026-10-13T10:00:00.000Z', content: { ...completeContent, process: [stage('stage-0', 'screening_call'), stage('stage-1', 'technical_interview')] } })

const state = vi.hoisted(() => ({ bodies: [] as { content: { process: Record<string, unknown>[] } }[], refuse: false }))
registerEndpoint('/api/v1/jobs/js1/pipeline', () =>
  ok({ ...pipeline([card('a1', 'stage-0'), card('a2', 'stage-0')]), job: { id: 'js1', title: 'Backend developer', status: 'published' } }),
)
registerEndpoint('/api/v1/jobs/js1', {
  method: 'PUT',
  handler: async (event) => {
    const body = await readBody<{ content: { process: Record<string, unknown>[] } }>(event)
    state.bodies.push(body)
    if (state.refuse) {
      setResponseStatus(event, 422)
      return { success: false, data: null, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'process', message: 'stage_has_open_applications:stage-1' }] } }
    }
    const process = body.content.process.map((item, index) => ({ ...item, id: (item.id as string | undefined) ?? `stg-new${index}` }))
    return ok({ ...published(), content: { ...body.content, process } })
  },
})

const mounted: { unmount: () => void }[] = []
const mountEditor = async () => {
  const wrapper = await mountSuspended(JobEditor, { props: { template: null, job: published() }, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  state.bodies.length = 0
  state.refuse = false
  clearNuxtData('pipeline-js1')
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('JobEditor stages of a published job', () => {
  it('shows the open candidates of each stage and blocks removing the ones that have any', async () => {
    const wrapper = await mountEditor()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="stage-open-count"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="stage-open-count"]').text()).toBe('2 candidati in questa fase')
    expect(wrapper.find('button[aria-label="Rimuovi la fase 1"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="stage-remove-blocked"]').text()).toBe("Sposta prima i 2 candidati in un'altra fase")
    expect(wrapper.find('button[aria-label="Rimuovi la fase 2"]').attributes('disabled')).toBeUndefined()
  })

  it('sends the ids of existing stages, none for new ones, and adopts the ids the server assigns', async () => {
    const wrapper = await mountEditor()
    await wrapper.findAll('button').find((b) => b.text() === 'Aggiungi fase')?.trigger('click')
    await wrapper.find('#job-field-process-2-type').setValue('offer')
    await wrapper.find('#job-field-process-2-duration').setValue('30')
    await wrapper.find('#job-field-process-2-by').setValue('recruiter')
    await wrapper.find('#job-field-process-0-title').setValue('Chiacchierata')
    await wrapper.find('button[aria-label="Sposta giù la fase 2"]').trigger('click')
    await wrapper.find('[data-testid="save"]').trigger('click')
    await vi.waitFor(() => expect(state.bodies).toHaveLength(1))
    await flushPromises()
    const sent = state.bodies[0]!.content.process
    expect(sent.map((item) => item.id)).toEqual(['stage-0', undefined, 'stage-1'])
    expect(sent[0]).toMatchObject({ title: 'Chiacchierata' })
    await vi.waitFor(() => expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Salvato'))
    // saved again without edits: every stage now travels with its id
    await wrapper.find('#job-field-process-0-title').setValue('Chiacchierata 2')
    await wrapper.find('[data-testid="save"]').trigger('click')
    await vi.waitFor(() => expect(state.bodies).toHaveLength(2))
    expect(state.bodies[1]!.content.process.map((item) => item.id)).toEqual(['stage-0', 'stg-new1', 'stage-1'])
  })

  it('maps a refusal from the server to the row of that stage', async () => {
    state.refuse = true
    const wrapper = await mountEditor()
    await wrapper.find('#job-field-process-1-title').setValue('Nuovo nome')
    await wrapper.find('[data-testid="save"]').trigger('click')
    await vi.waitFor(() => expect(state.bodies).toHaveLength(1))
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="stage-remove-blocked"]').length).toBeGreaterThan(0))
    expect(wrapper.find('button[aria-label="Rimuovi la fase 2"]').attributes('disabled')).toBeDefined()
    expect(document.body.textContent).toContain('Una fase con candidati aperti non si può rimuovere')
  })
})
