import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { CareersPageDocument } from '@tt/domain'
import { flushPromises } from '@vue/test-utils'
import { readBody, setResponseStatus, type H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editorDto, fixtureAssets, fixtureDocument, NOW, publicCareers } from '~~/test/fixtures/careers-editor-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import CareersPageEditor from './CareersPageEditor.vue'

const state = vi.hoisted(() => ({ editor: null as unknown, calls: [] as string[], puts: [] as unknown[], fail: null as 'save' | 'publish' | 'stale' | null, loads: 0 }))
const refuse = (event: H3Event) => {
  setResponseStatus(event, 403)
  return { success: false, data: null, error: { code: 'forbidden', message: 'no' } }
}
const stale = (event: H3Event) => {
  setResponseStatus(event, 409)
  return { success: false, data: null, error: { code: 'stale_revision', message: 'stale' } }
}
registerEndpoint('/api/v1/careers-page', {
  method: 'GET',
  handler: () => {
    state.loads += 1
    return ok(state.editor)
  },
})
registerEndpoint('/api/v1/careers-page/draft', {
  method: 'PUT',
  handler: async (event) => {
    const body = await readBody<{ revision: number; document: CareersPageDocument }>(event)
    state.calls.push('save')
    if (state.fail === 'save') return refuse(event)
    if (state.fail === 'stale') return stale(event)
    state.puts.push(body.document)
    return ok(editorDto({ draft: body.document, revision: body.revision + 1, isDefault: false, draftUpdatedAt: NOW, hasUnpublishedChanges: true }))
  },
})
registerEndpoint('/api/v1/careers-page/publish', {
  method: 'POST',
  handler: (event) => {
    state.calls.push('publish')
    if (state.fail === 'publish') return refuse(event)
    const last = (state.puts.at(-1) ?? fixtureDocument()) as CareersPageDocument
    return ok(editorDto({ draft: last, isDefault: false, draftUpdatedAt: NOW, publishedAt: '2026-10-14T09:00:00.000Z', hasUnpublishedChanges: false }))
  },
})
registerEndpoint('/api/v1/careers-page/media', { method: 'GET', handler: () => ok(fixtureAssets()) })
registerEndpoint('/api/v1/public/organizations/acme/jobs', () => ok(publicCareers()))

const mounted: { unmount: () => void }[] = []
const mountEditor = async () => {
  const wrapper = await mountSuspended(CareersPageEditor, { route: '/app/settings/careers', attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="careers-section-row"]').exists()).toBe(true))
  await flushPromises()
  return wrapper
}
type Wrapper = Awaited<ReturnType<typeof mountEditor>>
const rows = (wrapper: Wrapper) => wrapper.findAll('[data-testid="careers-section-row"]')
const types = (wrapper: Wrapper) => rows(wrapper).map((row) => row.attributes('data-section-type'))
const row = (wrapper: Wrapper, id: string) => wrapper.find(`[data-section-id="${id}"]`)
const preview = (wrapper: Wrapper) => wrapper.find('[data-testid="careers-preview"]')
const addSection = async (wrapper: Wrapper, type: string): Promise<void> => {
  await wrapper.find('[data-testid="careers-add-section"]').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  document.body.querySelector<HTMLElement>(`[data-testid="careers-add-${type}"]`)?.click()
  await flushPromises()
}

beforeEach(() => {
  state.editor = editorDto()
  state.calls.length = 0
  state.puts.length = 0
  state.fail = null
  state.loads = 0
  clearNuxtData()
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('careers page editor: layout and preview', () => {
  it('shows the sections, the never-published state and the live preview of the public page', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.find('[data-testid="careers-editor"]').exists()).toBe(true)
    expect(types(wrapper)).toEqual(['hero', 'jobs'])
    expect(wrapper.find('[data-testid="careers-published-at"]').text()).toBe('Mai pubblicata')
    expect(preview(wrapper).attributes('inert')).toBeDefined()
    expect(preview(wrapper).find('h1').text()).toBe('Posizioni aperte in Acme')
    await vi.waitFor(() => expect(preview(wrapper).text()).toContain('Backend developer'))
    expect(wrapper.find('[data-testid="careers-view-public"]').attributes()).toMatchObject({ href: '/careers/acme', target: '_blank', rel: 'noopener' })
    expect(wrapper.find('[data-testid="careers-save-state"]').text()).toBe('Salvato')
  })

  it('switches the preview between desktop and phone width', async () => {
    const wrapper = await mountEditor()
    expect(preview(wrapper).attributes('data-device')).toBe('desktop')
    await wrapper.find('[data-testid="careers-preview-mobile"]').trigger('click')
    expect(preview(wrapper).attributes('data-device')).toBe('mobile')
    expect(wrapper.find('[data-testid="careers-preview-mobile"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-testid="careers-preview-desktop"]').attributes('aria-pressed')).toBe('false')
  })

  it('updates the preview while the hero headline is typed, in the language being edited', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="careers-field-headline"]').setValue('Vieni a lavorare con noi')
    expect(preview(wrapper).find('h1').text()).toBe('Vieni a lavorare con noi')
    expect(wrapper.find('[data-testid="careers-save-state"]').text()).toBe('Modifiche non salvate')

    await wrapper.find('[data-testid="careers-editing-locale-en"]').trigger('click')
    const headline = wrapper.find<HTMLInputElement>('[data-testid="careers-field-headline"]')
    expect(headline.element.value).toBe('Open positions at Acme')
    await headline.setValue('')
    expect(headline.attributes('placeholder')).toBe('Vieni a lavorare con noi')
    await headline.setValue('Come work with us')
    expect(preview(wrapper).find('h1').text()).toBe('Come work with us')
  })
})

describe('careers page editor: sections', () => {
  it('adds a section after the selected one, never offering jobs or a second hero', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="careers-add-section"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(document.body.querySelector('[data-testid="careers-add-jobs"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="careers-add-hero"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="careers-add-values"]')?.textContent).toContain('Da 3 a 8 punti')
    document.body.querySelector<HTMLElement>('[data-testid="careers-add-text"]')?.click()
    await flushPromises()
    expect(types(wrapper)).toEqual(['hero', 'text', 'jobs'])
    expect(wrapper.find('[data-testid="careers-section-form"]').attributes('data-section-type')).toBe('text')
    expect(wrapper.find<HTMLInputElement>('[data-testid="careers-field-title"]').element.value).toBe('Chi siamo')
    expect(preview(wrapper).find('[data-testid="site-text"]').exists()).toBe(true)
  })

  it('moves with the buttons, keeps the hero first and announces the new position', async () => {
    state.editor = editorDto({ draft: fixtureDocument(), isDefault: false })
    const wrapper = await mountEditor()
    expect(row(wrapper, 'hero').find('[data-testid="careers-section-move-up"]').attributes('disabled')).toBeDefined()
    expect(row(wrapper, 'hero').find('[data-testid="careers-section-move-down"]').attributes('disabled')).toBeDefined()
    expect(row(wrapper, 'chi-siamo').find('[data-testid="careers-section-move-up"]').attributes('disabled')).toBeDefined()
    expect(row(wrapper, 'hero').find('[data-testid="careers-section-grip"]').exists()).toBe(false)

    await row(wrapper, 'jobs').find('[data-testid="careers-section-move-up"]').trigger('click')
    await flushPromises()
    expect(types(wrapper).slice(-3)).toEqual(['jobs', 'testimonials', 'links'])
    expect(wrapper.find('[data-testid="careers-sections-live"]').text()).toBe('Sezione spostata in posizione 8 di 10')
    await row(wrapper, 'chi-siamo').find('[data-testid="careers-section-move-down"]').trigger('click')
    expect(types(wrapper).slice(0, 3)).toEqual(['hero', 'image_text', 'text'])
  })

  it('hides a section from the preview, jobs included, and shows it again', async () => {
    const wrapper = await mountEditor()
    const toggle = row(wrapper, 'jobs').find('[data-testid="careers-section-toggle"]')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(row(wrapper, 'jobs').find('[data-testid="careers-section-hidden"]').text()).toBe('Nascosta')
    expect(preview(wrapper).find('[data-testid="site-jobs"]').exists()).toBe(false)
    await toggle.trigger('click')
    expect(preview(wrapper).find('[data-testid="site-jobs"]').exists()).toBe(true)
  })

  it('deletes after a confirmation, but never the open positions', async () => {
    state.editor = editorDto({ draft: fixtureDocument(), isDefault: false })
    const wrapper = await mountEditor()
    expect(row(wrapper, 'jobs').find('[data-testid="careers-section-delete"]').exists()).toBe(false)
    await row(wrapper, 'chi-siamo').find('[data-testid="careers-section-delete"]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Eliminare la sezione «Chi siamo»?')
    document.body.querySelector<HTMLElement>('[data-testid="confirm"]')?.click()
    await flushPromises()
    expect(row(wrapper, 'chi-siamo').exists()).toBe(false)
    expect(types(wrapper)).toHaveLength(9)
  })
})

describe('careers page editor: validation, theme, save and publish', () => {
  it('shows the issues of an incomplete gallery in place and blocks publishing', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.find('[data-testid="careers-publish"]').attributes('disabled')).toBeUndefined()
    await addSection(wrapper, 'gallery')
    expect(wrapper.find('[data-testid="careers-section-form"]').text()).toContain('Servono almeno 2 immagini.')
    expect(row(wrapper, 'gallery-1').find('[data-testid="careers-section-issues"]').text()).toBe('1 problema')
    expect(wrapper.find('[data-testid="careers-save-state"]').text()).toBe('1 problema da correggere')
    expect(wrapper.find('[data-testid="careers-publish"]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-testid="careers-save"]').trigger('click')
    await flushPromises()
    expect(state.calls).toEqual([])
    expect(wrapper.text()).toContain('la bozza si salva quando la pagina è valida')
  })

  it('refuses an accent no text reads on, with the measured contrast', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.find('[data-testid="careers-accent-verdict"]').attributes('data-passes')).toBe('true')
    await wrapper.find('[data-testid="careers-field-accent"]').setValue('#777777')
    const verdict = wrapper.find('[data-testid="careers-accent-verdict"]')
    expect(verdict.attributes('data-passes')).toBe('false')
    expect(verdict.text()).toMatch(/Contrasto 4,\d:1, il testo sul pulsante non si legge/)
    expect(wrapper.find('[data-testid="careers-publish"]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-testid="careers-field-accent"]').setValue('#12')
    expect(wrapper.text()).toContain('Scrivi un colore come #1f47d6.')
  })

  it('saves the whole document with the explicit save', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="careers-field-headline"]').setValue('Nuovo titolo')
    await wrapper.find('[data-testid="careers-save"]').trigger('click')
    await vi.waitFor(() => expect(state.calls).toEqual(['save']))
    await flushPromises()
    const sent = state.puts[0] as CareersPageDocument
    expect(sent.sections.map((section) => section.type)).toEqual(['hero', 'jobs'])
    expect(sent.sections[0]).toMatchObject({ headline: { it: 'Nuovo titolo' } })
    expect(wrapper.find('[data-testid="careers-save-state"]').text()).toBe('Salvato')
    expect(wrapper.find('[data-testid="careers-unpublished"]').text()).toBe('Modifiche non pubblicate')
  })

  it('saves pending changes before publishing, then shows the publication date', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="careers-field-headline"]').setValue('Pronti a pubblicare')
    await wrapper.find('[data-testid="careers-publish"]').trigger('click')
    await vi.waitFor(() => expect(state.calls).toEqual(['save', 'publish']))
    await flushPromises()
    expect(wrapper.find('[data-testid="careers-published-at"]').text()).toContain('Pubblicata il')
    expect(wrapper.find('[data-testid="careers-unpublished"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="careers-publish"]').attributes('disabled')).toBeDefined()
  })

  it('keeps the changes and says why when saving or publishing is refused', async () => {
    const wrapper = await mountEditor()
    state.fail = 'save'
    await wrapper.find('[data-testid="careers-field-headline"]').setValue('Non passa')
    await wrapper.find('[data-testid="careers-save"]').trigger('click')
    await vi.waitFor(() => expect(state.calls).toEqual(['save']))
    await flushPromises()
    expect(wrapper.find('[data-testid="careers-editor"] [role="alert"]').text()).toContain('permess')
    expect(wrapper.find('[data-testid="careers-save-state"]').text()).toBe('Modifiche non salvate')
    await wrapper.find('[data-testid="careers-publish"]').trigger('click')
    await vi.waitFor(() => expect(state.calls).toEqual(['save', 'save']))
    state.fail = 'publish'
    await wrapper.find('[data-testid="careers-field-headline"]').setValue('Passa, ma non si pubblica')
    await wrapper.find('[data-testid="careers-publish"]').trigger('click')
    await vi.waitFor(() => expect(state.calls).toEqual(['save', 'save', 'save', 'publish']))
    await flushPromises()
    expect(wrapper.find('[data-testid="careers-published-at"]').text()).toBe('Mai pubblicata')
  })

  it('never overwrites a page someone else saved: says so and offers to reload their version', async () => {
    const wrapper = await mountEditor()
    state.fail = 'stale'
    await wrapper.find('[data-testid="careers-field-headline"]').setValue('Sovrascriverei')
    await wrapper.find('[data-testid="careers-save"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="careers-stale"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="careers-stale"]').text()).toContain('Qualcun altro')
    expect(wrapper.find('[data-testid="careers-publish"]').attributes('disabled')).toBeDefined()
    // No autosave keeps hammering a refused revision.
    await new Promise((resolve) => setTimeout(resolve, 2300))
    expect(state.calls).toEqual(['save'])
    state.fail = null
    state.editor = editorDto({ revision: 3, isDefault: false, draft: { ...editorDto().draft, defaultLocale: 'it' } })
    const loadsBefore = state.loads
    await wrapper.find('[data-testid="careers-stale-reload"]').trigger('click')
    await vi.waitFor(() => expect(state.loads).toBeGreaterThan(loadsBefore))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="careers-stale"]').exists()).toBe(false))
    expect((wrapper.find('[data-testid="careers-field-headline"]').element as HTMLInputElement).value).not.toBe('Sovrascriverei')
  })

  it('saves a valid draft by itself shortly after the last change', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="careers-field-headline"]').setValue('Salvato da solo')
    expect(state.calls).toEqual([])
    await vi.waitFor(() => expect(state.calls).toEqual(['save']), { timeout: 4000 })
    expect(state.puts[0]).toMatchObject({ sections: [{ headline: { it: 'Salvato da solo' } }, { type: 'jobs' }] })
  })
})

describe('careers page editor: forms', () => {
  it('edits list items of a section and its theme font', async () => {
    const wrapper = await mountEditor()
    await addSection(wrapper, 'numbers')
    expect(wrapper.find('[data-testid="careers-section-form"]').text()).toContain('Campo obbligatorio.')
    await wrapper.find('[data-testid="careers-field-numbers-value-0"]').setValue('42')
    await wrapper.find('[data-testid="careers-field-numbers-value-1"]').setValue('2015')
    expect(preview(wrapper).find('[data-testid="site-numbers"]').text()).toContain('42')
    expect(wrapper.find('[data-testid="careers-save-state"]').text()).toBe('Modifiche non salvate')
    await wrapper.find('[data-testid="careers-numbers-add"]').trigger('click')
    expect(wrapper.findAll('[data-testid="careers-numbers-item"]')).toHaveLength(3)
    await wrapper.find('[data-testid="careers-numbers-remove-2"]').trigger('click')
    expect(wrapper.findAll('[data-testid="careers-numbers-item"]')).toHaveLength(2)

    await wrapper.find('[data-testid="careers-field-heading-font"] select, select[data-testid="careers-field-heading-font"]').setValue('fraunces')
    expect(preview(wrapper).find('[data-testid="careers-site"]').attributes('style')).toContain('Fraunces')
  })

  it('takes a YouTube link as provider and id, and refuses anything else', async () => {
    const wrapper = await mountEditor()
    await addSection(wrapper, 'video')
    expect(wrapper.find('[data-testid="careers-video-privacy"]').text()).toContain('finché chi visita non preme play')
    await wrapper.find('[data-testid="careers-field-video-url"]').setValue('https://example.com/video')
    expect(wrapper.text()).toContain('Questo link non è un video di YouTube o Vimeo.')
    await wrapper.find('[data-testid="careers-field-video-url"]').setValue('https://youtu.be/dQw4w9WgXcQ')
    expect(wrapper.find('[data-testid="careers-save-state"]').text()).toBe('Modifiche non salvate')
    expect(preview(wrapper).find('[data-testid="site-video"]').exists()).toBe(true)
  })
})
