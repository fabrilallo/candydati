import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pipeline } from '~~/test/fixtures/candidate-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { jobSummary } from '~~/test/fixtures/phase8-fixtures'
import ImportFilesStep from './ImportFilesStep.vue'

const state = vi.hoisted(() => ({ jobs: [] as unknown[], sent: null as FormData | null }))
registerEndpoint('/api/v1/jobs', () => ok(state.jobs, { total: 2, page: 1, limit: 100 }))
registerEndpoint('/api/v1/jobs/j1/pipeline', () => ok(pipeline()))

/** The upload goes through XMLHttpRequest for its progress: a fake one answers at once. */
class FakeXhr {
  status = 0
  responseText = ''
  upload = { onprogress: null as ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  open() {}
  setRequestHeader() {}
  abort() {}
  send(body: FormData) {
    state.sent = body
    this.upload.onprogress?.({ loaded: 5, total: 10, lengthComputable: true })
    this.status = 201
    this.responseText = JSON.stringify({ success: true, data: { id: 'b9', status: 'uploaded' } })
    queueMicrotask(() => this.onload?.())
  }
}

const mounted: { unmount: () => void }[] = []
const mountStep = async () => {
  const wrapper = await mountSuspended(ImportFilesStep)
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}
const pick = async (wrapper: Awaited<ReturnType<typeof mountStep>>, files: File[]) => {
  const input = wrapper.find('[data-testid="import-files-input"]')
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
  await input.trigger('change')
}
const file = (name: string, size = 10) => new File(['x'.repeat(size)], name)

beforeEach(() => {
  state.jobs = [jobSummary('j1', 'Backend developer'), jobSummary('j2', 'Vecchio annuncio', 'closed')]
  state.sent = null
  clearNuxtData()
  useViewer().viewer.value = viewerWith('recruiter')
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

describe('import files step', () => {
  it('lists picked files by kind, leaves out unsupported ones and offers only open jobs', async () => {
    const wrapper = await mountStep()
    await pick(wrapper, [file('anna.pdf'), file('persone.xlsx'), file('foto.png')])
    const picked = wrapper.find('[data-testid="import-picked"]').text()
    expect(picked).toContain('2 file')
    expect(picked).toContain('1 CV, 1 tabella')
    expect(wrapper.find('[data-testid="import-skipped"]').text()).toContain('foto.png: formato non supportato')
    const options = wrapper.findAll('select[data-testid="import-job"] option').map((option) => option.text())
    expect(options).toEqual(['Scegli un annuncio', 'Backend developer'])
    expect(wrapper.find('[data-testid="import-upload"]').attributes('disabled')).toBeDefined()
  })

  it('uploads files, job and stage, then hands over the batch', async () => {
    const wrapper = await mountStep()
    await pick(wrapper, [file('anna.pdf')])
    await wrapper.find('select[data-testid="import-job"]').setValue('j1')
    await vi.waitFor(() => expect(wrapper.findAll('select[data-testid="import-stage"] option').length).toBe(3))
    await wrapper.find('select[data-testid="import-stage"]').setValue('stage-0')
    await wrapper.find('[data-testid="import-files-step"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('uploaded')).toEqual([['b9']]))
    expect(state.sent?.get('jobId')).toBe('j1')
    expect(state.sent?.get('stageId')).toBe('stage-0')
    expect((state.sent?.getAll('files')[0] as File).name).toBe('anna.pdf')
  })

  it('stops a batch over the limits before uploading', async () => {
    const wrapper = await mountStep()
    await pick(wrapper, Array.from({ length: 1001 }, (_, index) => file(`cv-${index}.pdf`, 1)))
    expect(wrapper.find('[data-testid="import-limit-error"]').text()).toContain('Troppi file: 1001')
    expect(wrapper.find('[data-testid="import-upload"]').attributes('disabled')).toBeDefined()
  })

  it('points to the job editor when there is no open job', async () => {
    state.jobs = []
    const wrapper = await mountStep()
    expect(wrapper.find('[data-testid="import-no-jobs"]').text()).toContain('Crea un annuncio')
  })
})
