import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { MEDIA_LIMITS } from '@candydati/domain'
import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editorDto, imageAsset, publicCareers } from '~~/test/fixtures/careers-editor-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import CareersPageEditor from './CareersPageEditor.vue'

const UNUSED = '55555555-5555-4555-8555-555555555555'
const PUBLISHED = '66666666-6666-4666-8666-666666666666'
const UPLOADED = '77777777-7777-4777-8777-777777777777'
const state = vi.hoisted(() => ({ assets: [] as unknown[], deletes: [] as string[] }))
registerEndpoint('/api/v1/careers-page', { method: 'GET', handler: () => ok(editorDto()) })
registerEndpoint('/api/v1/careers-page/media', { method: 'GET', handler: () => ok(state.assets) })
registerEndpoint('/api/v1/public/organizations/acme/jobs', () => ok(publicCareers()))
registerEndpoint(`/api/v1/careers-page/media/${UNUSED}`, {
  method: 'DELETE',
  handler: (event) => {
    state.deletes.push(UNUSED)
    setResponseStatus(event, 409)
    return { success: false, data: null, error: { code: 'conflict', message: 'in use', issues: [{ path: 'mediaId', message: 'in_published_page' }] } }
  },
})

/** The upload seam: the editor creates a browser request per upload; the test drives it. */
class FakeXhr {
  static last: FakeXhr | null = null
  status = 0
  responseText = ''
  upload: { onprogress: ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  sent: FormData | null = null
  constructor() {
    FakeXhr.last = this
  }
  open() {}
  setRequestHeader() {}
  send(body: FormData) {
    this.sent = body
  }
  abort() {
    this.onabort?.()
  }
  respond(status: number, body: unknown) {
    this.status = status
    this.responseText = JSON.stringify(body)
    this.onload?.()
  }
}

const mounted: { unmount: () => void }[] = []
const byTestId = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const wrap = (id: string) => new DOMWrapper(byTestId(id)!)
const mountEditor = async () => {
  const wrapper = await mountSuspended(CareersPageEditor, { route: '/app/settings/careers', attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="careers-section-row"]').exists()).toBe(true))
  await flushPromises()
  return wrapper
}
type Wrapper = Awaited<ReturnType<typeof mountEditor>>
const openPicker = async (wrapper: Wrapper): Promise<void> => {
  await wrapper.find('[data-testid="careers-add-section"]').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  byTestId('careers-add-image_text')?.click()
  await flushPromises()
  await wrapper.find('[data-testid="careers-media-pick"]').trigger('click')
  await flushPromises()
}
const chooseFile = async (file: File): Promise<void> => {
  const input = byTestId('careers-media-file') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await new DOMWrapper(input).trigger('change')
}
const png = (size = 1024) => new File([new Uint8Array(Math.min(size, 16))], 'office.png', { type: 'image/png' })

beforeEach(() => {
  state.assets = [imageAsset(UNUSED, { alt: { it: 'Vecchia foto' } }), imageAsset(PUBLISHED, { usedInDraft: true, usedInPublished: true })]
  state.deletes.length = 0
  FakeXhr.last = null
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  clearNuxtData()
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

describe('media picker', () => {
  it('lists the images with where they are used, and picks one with its description', async () => {
    const wrapper = await mountEditor()
    await openPicker(wrapper)
    expect(byTestId('careers-media-dialog')?.textContent).toContain('Scegli un’immagine')
    const items = document.body.querySelectorAll('[data-testid="careers-media-item"]')
    expect(items).toHaveLength(2)
    expect(items[1]?.querySelector('[data-testid="careers-media-used"]')?.textContent).toBe('Nella pagina pubblicata')
    expect(items[1]?.querySelector('[data-testid="careers-media-delete"]')).toBeNull()
    expect(items[0]?.querySelector('img')?.getAttribute('src')).toContain('-w640.webp')
    ;(items[0]?.querySelector('[data-testid="careers-media-select"]') as HTMLElement).click()
    await flushPromises()
    expect(byTestId('careers-media-dialog')).toBeNull()
    expect(wrapper.find<HTMLInputElement>('[data-testid="careers-field-alt"]').element.value).toBe('Vecchia foto')
    expect(wrapper.find('[data-testid="careers-preview"] [data-testid="site-image-text"] img').exists()).toBe(true)
  })

  it('asks for a description before uploading, shows progress and selects the new image', async () => {
    const wrapper = await mountEditor()
    await openPicker(wrapper)
    await chooseFile(png())
    byTestId('careers-media-upload')?.click()
    await flushPromises()
    expect(byTestId('careers-media-dialog')?.textContent).toContain('Scrivi la descrizione dell’immagine in almeno una lingua.')
    expect(FakeXhr.last).toBeNull()

    await wrap('careers-media-alt-it').setValue('Il nuovo ufficio')
    byTestId('careers-media-upload')?.click()
    await flushPromises()
    const xhr = FakeXhr.last!
    expect(xhr.sent?.get('alt.it')).toBe('Il nuovo ufficio')
    xhr.upload.onprogress?.({ loaded: 50, total: 100, lengthComputable: true })
    await flushPromises()
    expect(byTestId('careers-media-progress')?.getAttribute('aria-valuenow')).toBe('50')
    xhr.respond(201, { success: true, data: imageAsset(UPLOADED, { alt: { it: 'Il nuovo ufficio' } }) })
    await flushPromises()
    expect(byTestId('careers-media-dialog')).toBeNull()
    expect(wrapper.find<HTMLInputElement>('[data-testid="careers-field-alt"]').element.value).toBe('Il nuovo ufficio')
    expect(wrapper.find('[data-testid="careers-section-issues"]').exists()).toBe(false)
  })

  it('checks size and type before sending and explains the api refusals', async () => {
    const wrapper = await mountEditor()
    await openPicker(wrapper)
    const huge = png()
    Object.defineProperty(huge, 'size', { value: MEDIA_LIMITS.imageMaxBytes + 1 })
    await chooseFile(huge)
    expect(byTestId('careers-media-dialog')?.textContent).toContain('File troppo grande')
    await chooseFile(new File(['x'], 'a.gif', { type: 'image/gif' }))
    expect(byTestId('careers-media-dialog')?.textContent).toContain('Formato non supportato')

    await chooseFile(png())
    await wrap('careers-media-alt-en').setValue('Office')
    byTestId('careers-media-upload')?.click()
    await flushPromises()
    FakeXhr.last!.respond(422, { success: false, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'file', message: 'image_unreadable' }] } })
    await flushPromises()
    expect(byTestId('careers-media-dialog')?.textContent).toContain('Non riusciamo a leggere questa immagine')
  })

  it('cancels an upload in progress', async () => {
    const wrapper = await mountEditor()
    await openPicker(wrapper)
    await chooseFile(png())
    await wrap('careers-media-alt-it').setValue('Ufficio')
    byTestId('careers-media-upload')?.click()
    await flushPromises()
    byTestId('careers-media-cancel')?.click()
    await flushPromises()
    expect(byTestId('careers-media-dialog')?.textContent).toContain('Caricamento annullato.')
    expect(byTestId('careers-media-progress')).toBeNull()
  })

  it('deletes only unused files, after a confirmation, and says why the api refused', async () => {
    const wrapper = await mountEditor()
    await openPicker(wrapper)
    byTestId('careers-media-delete')?.click()
    await flushPromises()
    byTestId('careers-media-delete-confirm')?.click()
    await vi.waitFor(() => expect(state.deletes).toEqual([UNUSED]))
    await vi.waitFor(() => expect(byTestId('careers-media-error')?.textContent).toBe('Il file è nella pagina pubblicata: toglilo e pubblica di nuovo prima di eliminarlo.'))
    expect(document.body.querySelectorAll('[data-testid="careers-media-item"]')).toHaveLength(2)
  })
})

describe('careers settings page', () => {
  it('shows the editor to an owner and the refusal to a recruiter', async () => {
    const Page = (await import('../../../pages/app/settings/careers.vue')).default
    const owner = await mountSuspended(Page, { route: '/app/settings/careers', global: { stubs: { CareersPageEditor: true } } })
    mounted.push(owner)
    expect(owner.findComponent({ name: 'CareersPageEditor' }).exists()).toBe(true)
    useViewer().viewer.value = viewerWith('recruiter')
    const recruiter = await mountSuspended(Page, { route: '/app/settings/careers' })
    mounted.push(recruiter)
    expect(recruiter.find('h1').text()).toBe('Pagina carriera')
    expect(recruiter.find('[role="alert"]').exists()).toBe(true)
    expect(recruiter.find('[data-testid="careers-editor"]').exists()).toBe(false)
  })
})

