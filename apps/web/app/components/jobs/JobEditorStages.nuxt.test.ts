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

const state = vi.hoisted(() => ({ bodies: [] as { content: { process: Record<string, unknown>[] } }[], refuse: false, duplicates: 0, interviewerReads: 0 }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('vue-sonner', () => ({ toast: toasts }))
registerEndpoint('/api/v1/jobs/js1/stages/stage-1/duplicate', {
  method: 'POST',
  handler: () => {
    state.duplicates += 1
    const [first, second] = published().content.process
    return ok({ job: { ...published(), content: { ...published().content, process: [first, second, { ...second, id: 'stg-copy' }] } }, stageId: 'stg-copy', copied: ['interviewers'], skipped: ['automations'] })
  },
})
registerEndpoint('/api/v1/jobs/js1/stages/stage-0/duplicate', {
  method: 'POST',
  handler: (event) => {
    setResponseStatus(event, 403)
    return { success: false, data: null, error: { code: 'forbidden', message: 'x' } }
  },
})
registerEndpoint('/api/v1/jobs/js1/interviewers', () => {
  state.interviewerReads += 1
  return ok([])
})
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
  state.duplicates = 0
  state.interviewerReads = 0
  toasts.success.mockClear()
  toasts.error.mockClear()
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

  it('duplicates a saved stage through the api, refreshes its configuration, focuses the copy and says what came along', async () => {
    const wrapper = await mountEditor()
    await vi.waitFor(() => expect(state.interviewerReads).toBeGreaterThan(0))
    const reads = state.interviewerReads
    await wrapper.find('button[aria-label="Duplica la fase 2"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="stage-row"]')).toHaveLength(3))
    expect(state.duplicates).toBe(1)
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('job-field-process-2-title'))
    await vi.waitFor(() => expect(state.interviewerReads).toBeGreaterThan(reads))
    expect(toasts.success).toHaveBeenCalledWith('Fase duplicata', { description: 'Copiato anche: chi fa il colloquio. Non copiato, serve un permesso che non hai: automazioni.' })
    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Salvato')
  })

  it('does not call the api for a saved stage while the form has unsaved changes', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('#job-field-process-0-title').setValue('Modificato')
    const button = wrapper.find('button[aria-label="Duplica la fase 2"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="stage-duplicate-blocked"]').text()).toBe('Salva le modifiche per duplicare una fase con le sue regole.')
    await button.trigger('click')
    expect(state.duplicates).toBe(0)
  })

  it('says so when the api refuses, and leaves the stages as they were', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('button[aria-label="Duplica la fase 1"]').trigger('click')
    await vi.waitFor(() => expect(toasts.error).toHaveBeenCalledTimes(1))
    expect(toasts.error.mock.calls[0]?.[0]).toBe('Non è stato possibile duplicare la fase')
    expect(wrapper.findAll('[data-testid="stage-row"]')).toHaveLength(2)
    expect(wrapper.find('button[aria-label="Duplica la fase 1"]').attributes('disabled')).toBeUndefined()
  })
})
