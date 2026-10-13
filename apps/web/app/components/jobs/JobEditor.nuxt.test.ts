import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeContent, incompleteContent, makeAssessment, makeJob, ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import JobEditor from './JobEditor.vue'

const state = vi.hoisted(() => ({ calls: [] as string[], assessment: null as unknown, bodies: {} as Record<string, unknown> }))
const navigate = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => navigate)

const job = makeJob()
registerEndpoint('/api/v1/jobs', { method: 'POST', handler: async (e) => (state.calls.push('create'), (state.bodies.create = await readBody(e)), ok(makeJob({ id: 'j-new' }))) })
registerEndpoint('/api/v1/jobs/quality', { method: 'POST', handler: () => (state.calls.push('quality'), ok({ assessment: state.assessment, publishIssues: [] })) })
registerEndpoint('/api/v1/jobs/j1', { method: 'PUT', handler: () => (state.calls.push('update'), ok(job)) })
registerEndpoint('/api/v1/jobs/j1/publish', {
  method: 'POST',
  handler: () => (state.calls.push('publish'), ok({ job: makeJob({ status: 'published', publishedAt: '2026-10-13T11:00:00.000Z' }), quality: state.assessment })),
})
registerEndpoint('/api/v1/jobs/j1/close', { method: 'POST', handler: () => (state.calls.push('close'), ok(makeJob({ status: 'closed', closedAt: '2026-10-14T10:00:00.000Z' }))) })
registerEndpoint('/api/v1/job-templates', { method: 'POST', handler: async (e) => (state.calls.push('template'), (state.bodies.template = await readBody(e)), ok({ id: 't1', name: 'x', content: completeContent, updatedAt: '2026-10-13T10:00:00.000Z' })) })

const body = () => document.body
const mounted: { unmount: () => void }[] = []
const mountEditor = async (props: { job: ReturnType<typeof makeJob> | null } = { job }) => {
  const wrapper = await mountSuspended(JobEditor, { props: { template: null, ...props } })
  mounted.push(wrapper)
  return wrapper
}
const settled = async (expected: string[]): Promise<void> => {
  await vi.waitFor(() => expect(state.calls).toEqual(expected))
  await flushPromises()
}
const byTestId = (id: string) => body().querySelector<HTMLElement>(`[data-testid="${id}"]`)

beforeEach(() => {
  state.calls.length = 0
  state.assessment = makeAssessment(7.5)
  state.bodies = {}
  navigate.mockReset()
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})

describe('JobEditor rule panel', () => {
  it('disables Publish and lists what is missing, computed locally', async () => {
    const wrapper = await mountEditor({ job: makeJob({ content: incompleteContent }) })
    expect(wrapper.find('[data-testid="publish"]').attributes('disabled')).toBeDefined()
    const issues = wrapper.findAll('[data-testid="checklist-issue"]').map((row) => row.text())
    expect(issues.length).toBeGreaterThanOrEqual(8)
    expect(issues.join(' ')).toContain('Ruolo')
    expect(wrapper.text()).toContain('Completa gli elementi mancanti per pubblicare')
  })

  it('updates the list as the form changes and enables Publish when nothing is missing', async () => {
    const wrapper = await mountEditor({ job: makeJob({ content: { ...completeContent, responsibilities: ['una', 'due'] } }) })
    expect(wrapper.findAll('[data-testid="checklist-issue"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="publish"]').attributes('disabled')).toBeDefined()
    await wrapper.find('#job-field-responsibilities-1').setValue('due')
    const add = wrapper.findAll('#job-field-responsibilities button').find((button) => button.text() === 'Aggiungi voce')
    await add?.trigger('click')
    await wrapper.find('#job-field-responsibilities-2').setValue('tre')
    expect(wrapper.find('[data-testid="checklist-ready"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="publish"]').attributes('disabled')).toBeUndefined()
  })

  it('shows city and on-site days only for hybrid and on-site work', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.find('#job-field-location-city').exists()).toBe(true)
    await wrapper.find('#job-field-workMode').setValue('remote')
    expect(wrapper.find('#job-field-location-city').exists()).toBe(false)
    expect(wrapper.find('#job-field-location-onsiteDaysPerWeek').exists()).toBe(false)
  })
})

describe('JobEditor publish flow', () => {
  it('publishes directly when the score is above the threshold, and shows the public url', async () => {
    state.assessment = makeAssessment(8)
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="publish"]').trigger('click')
    await settled(['quality', 'publish'])
    expect(byTestId('below-threshold-dialog')).toBeNull()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="public-url"]').text()).toBe('http://localhost:3000/careers/acme/backend-developer-abc123'))
    expect(wrapper.find('[data-testid="publish"]').exists()).toBe(false)
  })

  it('asks for confirmation below the threshold and lets the user go back', async () => {
    state.assessment = makeAssessment(4)
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="publish"]').trigger('click')
    await settled(['quality'])
    const dialog = byTestId('below-threshold-dialog')
    expect(dialog?.textContent).toContain('sotto la soglia consigliata')
    expect(dialog?.textContent).toContain('Descrivi i benefit')
    byTestId('back-to-edit')?.click()
    await flushPromises()
    expect(state.calls).toEqual(['quality'])
    expect(byTestId('below-threshold-dialog')).toBeNull()
  })

  it('publishes anyway after confirmation: the score never blocks', async () => {
    state.assessment = makeAssessment(4)
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="publish"]').trigger('click')
    await settled(['quality'])
    byTestId('publish-anyway')?.click()
    await settled(['quality', 'publish'])
    await vi.waitFor(() => expect(wrapper.find('[data-testid="published-panel"]').exists()).toBe(true))
  })

  it('saves first when the form is dirty, then analyses, then publishes', async () => {
    state.assessment = makeAssessment(9)
    const wrapper = await mountEditor()
    await wrapper.find('#job-field-title').setValue('Backend developer senior')
    expect(wrapper.find('[data-testid="unsaved"]').exists()).toBe(true)
    await wrapper.find('[data-testid="publish"]').trigger('click')
    await settled(['update', 'quality', 'publish'])
    await vi.waitFor(() => expect(wrapper.find('[data-testid="unsaved"]').exists()).toBe(false))
  })

  it('does not run the analysis on keystrokes', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('#job-field-title').setValue('Another title')
    await wrapper.find('#job-field-summary').setValue('Some text')
    await flushPromises()
    expect(state.calls).toEqual([])
    await wrapper.find('[data-testid="analyze"]').trigger('click')
    await settled(['quality'])
    expect(wrapper.find('[data-testid="quality-total"]').text()).toContain('7,5')
  })
})

describe('JobEditor saving', () => {
  it('creates a new ad from only a title and moves to its page', async () => {
    const wrapper = await mountEditor({ job: null })
    await wrapper.find('#job-field-title').setValue('Idea di annuncio')
    await wrapper.find('form').trigger('submit')
    await settled(['create'])
    expect((state.bodies.create as { content: { title: string } }).content.title).toBe('Idea di annuncio')
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/app/jobs/j-new', { replace: true }))
  })

  it('refuses to save without a title and points at the field', async () => {
    const wrapper = await mountEditor({ job: null })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(state.calls).toEqual([])
    expect(wrapper.find('#job-field-title').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Campo obbligatorio')
  })

  it('saves the current form as a template with a name', async () => {
    const wrapper = await mountEditor()
    const open = wrapper.findAll('button').find((button) => button.text() === 'Salva come template')
    await open?.trigger('click')
    await flushPromises()
    const input = body().querySelector<HTMLInputElement>('#template-name')
    await new DOMWrapper(input!).setValue('Backend senior')
    body().querySelector<HTMLFormElement>('[role="dialog"] form')?.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()
    await settled(['template'])
    expect(state.bodies.template).toMatchObject({ name: 'Backend senior' })
  })
})

describe('JobEditor permissions and status', () => {
  it('renders read-only for roles without job:update', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = await mountEditor()
    expect(wrapper.find('[data-testid="readonly-note"]').text()).toContain('Sola lettura')
    expect(wrapper.find('[data-testid="save"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="publish"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="close-job"]').exists()).toBe(false)
    expect(wrapper.find('#job-field-title').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="publish-checklist"]').exists()).toBe(false)
  })

  it('hides Publish without job:publish but lets a hiring manager edit', async () => {
    useViewer().viewer.value = viewerWith('hiring_manager')
    const wrapper = await mountEditor()
    expect(wrapper.find('[data-testid="publish"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="save"]').exists()).toBe(true)
  })

  it('closes a published ad after confirmation, then becomes read-only', async () => {
    const wrapper = await mountEditor({ job: makeJob({ status: 'published', publishedAt: '2026-10-13T11:00:00.000Z' }) })
    expect(wrapper.find('[data-testid="save"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="published-panel"]').exists()).toBe(true)
    await wrapper.find('[data-testid="close-job"]').trigger('click')
    await flushPromises()
    expect(state.calls).toEqual([])
    byTestId('confirm')?.click()
    await settled(['close'])
    await vi.waitFor(() => expect(wrapper.find('[data-testid="readonly-note"]').text()).toContain('chiuso'))
    expect(wrapper.find('[data-testid="save"]').exists()).toBe(false)
  })

  it('offers no way to close a draft', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.find('[data-testid="close-job"]').exists()).toBe(false)
  })
})
