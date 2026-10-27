import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeContent, incompleteContent, makeAssessment, makeJob, ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import JobEditor from './JobEditor.vue'

const state = vi.hoisted(() => ({ calls: [] as string[], assessment: null as unknown, bodies: {} as Record<string, unknown>, noNotice: false }))
const navigate = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => navigate)

const job = makeJob()
registerEndpoint('/api/v1/jobs', { method: 'POST', handler: async (e) => (state.calls.push('create'), (state.bodies.create = await readBody(e)), ok(makeJob({ id: 'j-new' }))) })
registerEndpoint('/api/v1/jobs/quality', { method: 'POST', handler: () => (state.calls.push('quality'), ok({ status: state.assessment ? 'assessed' : 'unavailable', assessment: state.assessment, publishIssues: [] })) })
registerEndpoint('/api/v1/jobs/j1', { method: 'PUT', handler: () => (state.calls.push('update'), ok(job)) })
registerEndpoint('/api/v1/jobs/j1/publish', {
  method: 'POST',
  handler: (event) => {
    state.calls.push('publish')
    if (state.noNotice) {
      setResponseStatus(event, 422)
      return { success: false, data: null, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'organization.privacyNotice', message: 'privacy_notice_required' }] } }
    }
    return ok({ job: makeJob({ status: 'published', publishedAt: '2026-10-13T11:00:00.000Z' }), quality: state.assessment, qualityStatus: state.assessment ? 'assessed' : 'unavailable' })
  },
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
  state.noNotice = false
  navigate.mockReset()
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})

const openMenu = async (wrapper: Awaited<ReturnType<typeof mountEditor>>, testId: string): Promise<void> => {
  await wrapper.find(`[data-testid="${testId}"]`).trigger('keydown', { key: 'Enter' })
  await flushPromises()
}

describe('JobEditor readiness and gaps', () => {
  it('disables Publish and shows what is missing in place, computed locally', async () => {
    const wrapper = await mountEditor({ job: makeJob({ content: incompleteContent }) })
    expect(wrapper.find('[data-testid="publish"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="readiness"]').text()).toContain('Mancano 10 elementi')
    const gaps = wrapper.findAll('[data-testid="ad-gap"]').map((gap) => gap.attributes('data-gap'))
    expect(new Set(gaps)).toEqual(new Set(['role', 'seniority', 'contractType', 'salary', 'workMode', 'place', 'process', 'responseDays', 'responsibilities', 'mustHave']))
    expect(wrapper.find('[data-gap="salary"]').text()).toBe('Manca la RAL: aggiungila per pubblicare')
    expect(wrapper.text()).toContain('Completa gli elementi mancanti per pubblicare')
    expect(state.calls).toEqual([])
  })

  it('updates as the form changes, with Enter adding the next item, and enables Publish when nothing is missing', async () => {
    const wrapper = await mountEditor({ job: makeJob({ content: { ...completeContent, responsibilities: ['una', 'due'] } }) })
    expect(wrapper.find('[data-testid="readiness"]').text()).toContain('Manca 1 elemento')
    expect(wrapper.find('[data-gap="responsibilities"]').text()).toBe('Servono almeno tre responsabilità')
    await wrapper.find('#job-field-responsibilities-1').trigger('keydown', { key: 'Enter' })
    await wrapper.find('#job-field-responsibilities-2').setValue('tre')
    expect(wrapper.find('[data-testid="readiness-ready"]').text()).toBe('Pronto per pubblicare')
    expect(wrapper.find('[data-testid="ad-gap"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="publish"]').attributes('disabled')).toBeUndefined()
  })

  it('repeats Publish at the end of the form, with what is missing and a jump to the first gap', async () => {
    const wrapper = await mountEditor({ job: makeJob({ content: { ...completeContent, responsibilities: ['una', 'due'] } }) })
    const finish = wrapper.find('[data-testid="editor-finish"]')
    expect(finish.text()).toContain('Manca 1 elemento')
    expect(finish.find('[data-testid="publish-end"]').attributes('disabled')).toBeDefined()
    expect(finish.find('[data-testid="finish-jump"]').exists()).toBe(true)
    await wrapper.find('#job-field-responsibilities-1').trigger('keydown', { key: 'Enter' })
    await wrapper.find('#job-field-responsibilities-2').setValue('tre')
    expect(wrapper.find('[data-testid="editor-finish"]').text()).toContain('Pronto per pubblicare')
    expect(wrapper.find('[data-testid="publish-end"]').attributes('disabled')).toBeUndefined()
  })

  it('keeps a fresh draft quiet and shows a field rule once the user leaves the field', async () => {
    const wrapper = await mountEditor({ job: null })
    expect(wrapper.find('#job-field-role').attributes('aria-invalid')).toBeUndefined()
    await wrapper.find('#job-field-role').trigger('focusout')
    expect(wrapper.find('#job-field-role').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('#job-field-role-error').text()).toBe('Campo obbligatorio per pubblicare')
    expect(wrapper.find('#job-field-seniority').attributes('aria-invalid')).toBeUndefined()
  })

  it('reveals every rule on the form when the readiness list is opened', async () => {
    const wrapper = await mountEditor({ job: makeJob({ content: incompleteContent }) })
    await openMenu(wrapper, 'readiness')
    expect(body().querySelectorAll('[data-testid="readiness-gap"]')).toHaveLength(10)
    expect(wrapper.find('#job-field-seniority').attributes('aria-invalid')).toBe('true')
  })

  it('jumps from a gap in the preview to its form field', async () => {
    const wrapper = await mountSuspended(JobEditor, { props: { template: null, job: makeJob({ content: incompleteContent }) }, attachTo: document.body })
    mounted.push(wrapper)
    await wrapper.find('[data-gap="salary"]').trigger('click')
    await flushPromises()
    expect(document.activeElement?.id).toBe('job-field-salary-min')
  })

  it('shows city and on-site days only for hybrid and on-site work', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.find('#job-field-location-city').exists()).toBe(true)
    await wrapper.findAll('#job-field-workMode [role="radio"]').find((radio) => radio.text() === 'Da remoto')?.trigger('click')
    expect(wrapper.find('#job-field-location-city').exists()).toBe(false)
    expect(wrapper.find('#job-field-location-onsiteDaysPerWeek').exists()).toBe(false)
  })
})

describe('JobEditor live preview', () => {
  it('renders the ad as the candidate will read it, updated as you type', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.find('[data-testid="job-ad"]').attributes('data-mode')).toBe('preview')
    expect(wrapper.find('[data-testid="ad-title"]').text()).toBe('Backend developer')
    await wrapper.find('#job-field-title').setValue('Backend developer senior')
    expect(wrapper.find('[data-testid="ad-title"]').text()).toBe('Backend developer senior')
    await wrapper.find('#job-field-salary-max').setValue('70000')
    expect(wrapper.find('[data-fact="salary"]').text()).toContain('45.000 - 70.000 €')
    expect(state.calls).toEqual([])
  })

  it('underlines the vague phrases of the last analysis in the preview', async () => {
    const wrapper = await mountEditor({ job: makeJob({ content: { ...completeContent, summary: 'Offriamo uno stipendio competitivo.' } }) })
    expect(wrapper.find('[data-testid="vague-mark"]').exists()).toBe(false)
    await wrapper.find('[data-testid="analyze"]').trigger('click')
    await settled(['quality'])
    expect(wrapper.find('[data-testid="vague-mark"]').text()).toContain('stipendio competitivo')
  })

  it('switches between form and preview below xl', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.find('[data-testid="editor-form-pane"]').classes()).not.toContain('hidden')
    await wrapper.find('[data-testid="mode-preview"]').trigger('click')
    expect(wrapper.find('[data-testid="editor-form-pane"]').classes()).toContain('hidden')
    expect(wrapper.find('[data-testid="editor-preview-pane"]').classes()).not.toContain('hidden')
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
    expect(byTestId('published-dialog-url')?.textContent).toBe('http://localhost:3000/careers/acme/backend-developer-abc123')
    useState('job-just-published').value = null
  })

  it('publishes from the button at the end of the form too', async () => {
    state.assessment = makeAssessment(8)
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="publish-end"]').trigger('click')
    await settled(['quality', 'publish'])
    await vi.waitFor(() => expect(wrapper.find('[data-testid="public-url"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="editor-finish"]').exists()).toBe(false)
    useState('job-just-published').value = null
  })

  it('explains a refusal for the missing privacy notice, with the way to write it', async () => {
    state.assessment = makeAssessment(8)
    state.noNotice = true
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="publish"]').trigger('click')
    await settled(['quality', 'publish'])
    await vi.waitFor(() => expect(wrapper.find('[data-testid="privacy-required"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="privacy-required"]').text()).toContain("Per pubblicare serve l'informativa privacy")
    expect(wrapper.find('[data-testid="privacy-required"] a').attributes('href')).toBe('/app/settings/privacy')
  })

  it('links the candidates of a saved ad from the header tabs', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.find('[data-testid="tab-candidates"]').attributes('href')).toBe('/app/jobs/j1/candidates')
    expect(wrapper.find('[data-testid="tab-ad"]').attributes('aria-current')).toBe('page')
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
    useState('job-just-published').value = null
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

  it('publishes without any score or confirmation when the instance has no model', async () => {
    state.assessment = null
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="publish"]').trigger('click')
    await settled(['quality', 'publish'])
    expect(byTestId('below-threshold-dialog')).toBeNull()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="published-panel"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="quality-total"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="quality-ai-off"]').exists()).toBe(true)
    expect(body().textContent).not.toContain("L'analisi di qualità non è riuscita")
    useState('job-just-published').value = null
  })

  it('says the score needs AI when asked for it on an instance without a model', async () => {
    state.assessment = null
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="analyze"]').trigger('click')
    await settled(['quality'])
    expect(wrapper.find('[data-testid="quality-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="quality-total"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="quality-ai-off"]').text()).toContain("richiede l'AI")
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
    await openMenu(wrapper, 'more-actions')
    body().querySelector<HTMLElement>('[data-testid="save-template"]')?.click()
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
    expect(wrapper.find('[data-testid="readiness"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="quality-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="job-ad"]').exists()).toBe(true)
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
    await openMenu(wrapper, 'more-actions')
    body().querySelector<HTMLElement>('[data-testid="close-job"]')?.click()
    await flushPromises()
    expect(state.calls).toEqual([])
    byTestId('confirm')?.click()
    await settled(['close'])
    await vi.waitFor(() => expect(wrapper.find('[data-testid="readonly-note"]').text()).toContain('chiuso'))
    expect(wrapper.find('[data-testid="save"]').exists()).toBe(false)
  })

  it('offers no way to close a draft', async () => {
    const wrapper = await mountEditor()
    await openMenu(wrapper, 'more-actions')
    expect(body().querySelector('[data-testid="save-template"]')).not.toBeNull()
    expect(body().querySelector('[data-testid="close-job"]')).toBeNull()
  })

  it('announces the save state', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.find('[data-testid="save-status"]').attributes('aria-live')).toBe('polite')
    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Salvato')
    await wrapper.find('#job-field-title').setValue('Altro titolo')
    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Modifiche non salvate')
  })
})

describe('JobEditor compliance', () => {
  it('blocks a masculine-only title, lists it with its fix, and the fix makes the ad publishable again', async () => {
    const wrapper = await mountEditor({ job: makeJob({ content: { ...completeContent, title: 'Sviluppatore backend' } }) })
    await flushPromises()
    expect(wrapper.find('[data-testid="publish"]').attributes('disabled') !== undefined).toBe(true)
    const panel = wrapper.find('[data-testid="compliance-blocking"]')
    expect(panel.text()).toContain('Il titolo si rivolge a un solo sesso')
    expect(panel.text()).toContain('«Sviluppatore»')
    await wrapper.find('[data-testid="compliance-fix"]').trigger('click')
    await flushPromises()
    expect((wrapper.find('#job-field-title').element as HTMLInputElement).value).toBe('Sviluppatore backend (m/f)')
    expect(wrapper.find('[data-testid="compliance-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="publish"]').attributes('disabled') !== undefined).toBe(false)
  })

  it('shows doubtful wording as a quiet list that never blocks', async () => {
    const wrapper = await mountEditor({ job: makeJob({ content: { ...completeContent, summary: 'Il candidato ideale ama il codice.' } }) })
    await flushPromises()
    expect(wrapper.find('[data-testid="compliance-blocking"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="compliance-warnings"]').text()).toContain('Da rivedere')
    expect(wrapper.find('[data-testid="publish"]').attributes('disabled') !== undefined).toBe(false)
  })

  it('explains a publication refused for approval and asks for it in place', async () => {
    registerEndpoint('/api/v1/jobs/j2/publish', {
      method: 'POST',
      handler: (event) => {
        setResponseStatus(event, 422)
        return { success: false, data: null, error: { code: 'approval_required', message: 'x' } }
      },
    })
    registerEndpoint('/api/v1/jobs/j2/approval', () => ok({ requireApproval: true, approval: null, publishable: false }))
    registerEndpoint('/api/v1/jobs/j2/approval-request', { method: 'POST', handler: async (e) => ((state.bodies.approval = await readBody(e)), ok({ id: 'r1' })) })
    const wrapper = await mountEditor({ job: makeJob({ id: 'j2' }) })
    await vi.waitFor(() => expect(wrapper.find('[data-testid="approval-note"]').attributes('data-state')).toBe('missing'))
    await wrapper.find('[data-testid="publish"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="approval-note"]').text()).toContain("Serve un'approvazione"))
    await wrapper.find('[data-testid="approval-ask"]').trigger('click')
    await flushPromises()
    await new DOMWrapper(document.body.querySelector<HTMLTextAreaElement>('#approval-reason')!).setValue('Serve entro gennaio')
    await new DOMWrapper(document.body.querySelector<HTMLElement>('[data-testid="approval-send"]')!).trigger('click')
    await vi.waitFor(() => expect(state.bodies.approval).toEqual({ reason: 'Serve entro gennaio' }))
  })
})
