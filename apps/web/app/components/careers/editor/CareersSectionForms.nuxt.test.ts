import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editorDto, fixtureAssets, fixtureDocument, publicCareers } from '~~/test/fixtures/careers-editor-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import CareersPageEditor from './CareersPageEditor.vue'

registerEndpoint('/api/v1/careers-page', { method: 'GET', handler: () => ok(editorDto({ draft: fixtureDocument(), isDefault: false, publishedAt: '2026-10-10T09:00:00.000Z' })) })
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
const select = async (wrapper: Wrapper, id: string): Promise<void> => {
  await wrapper.find(`[data-section-id="${id}"] [data-testid="careers-section-select"]`).trigger('click')
}
const form = (wrapper: Wrapper) => wrapper.find('[data-testid="careers-section-form"]')
const site = (wrapper: Wrapper, id: string) => wrapper.find(`[data-testid="careers-preview"] [data-testid="${id}"]`)
const state = (wrapper: Wrapper) => wrapper.find('[data-testid="careers-save-state"]').text()
const pickFirst = async (wrapper: Wrapper, pick: string): Promise<void> => {
  await wrapper.find(`[data-testid="${pick}"]`).trigger('click')
  await flushPromises()
  document.body.querySelector<HTMLElement>('[data-testid="careers-media-select"]')?.click()
  await flushPromises()
}

beforeEach(() => {
  clearNuxtData()
  useViewer().viewer.value = viewerWith('admin')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('section forms', () => {
  it('edits the hero background: none, image, video with poster, and the veil never below 40', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.find('[data-testid="careers-published-at"]').text()).toContain('Pubblicata il')
    expect(wrapper.find<HTMLInputElement>('[data-testid="careers-field-overlay"]').element.min).toBe('40')
    await wrapper.find('select[data-testid="careers-field-background-kind"]').setValue('none')
    expect(wrapper.find('[data-testid="careers-field-overlay"]').exists()).toBe(false)
    await wrapper.find('select[data-testid="careers-field-background-kind"]').setValue('image')
    expect(form(wrapper).text()).toContain('Scegli un file.')
    await pickFirst(wrapper, 'careers-media-pick')
    expect(form(wrapper).text()).not.toContain('Scegli un file.')
    await wrapper.find('[data-testid="careers-field-overlay"]').setValue('70')
    await wrapper.find('select[data-testid="careers-field-alignment"]').setValue('center')
    await wrapper.find('select[data-testid="careers-field-background-kind"]').setValue('video')
    expect(wrapper.find('[data-testid="careers-media-pick-poster"]').exists()).toBe(true)
    expect(state(wrapper)).toBe('1 problema da correggere')
  })

  it('edits text, image and text, gallery items with their descriptions', async () => {
    const wrapper = await mountEditor()
    await select(wrapper, 'chi-siamo')
    await wrapper.find('[data-testid="careers-field-body"]').setValue('Primo paragrafo.\n\nSecondo.')
    expect(site(wrapper, 'site-text').findAll('p').length).toBeGreaterThanOrEqual(2)

    await select(wrapper, 'ufficio')
    await wrapper.find('select[data-testid="careers-field-image-side"]').setValue('left')
    await wrapper.find('[data-testid="careers-field-alt"]').setValue('')
    expect(form(wrapper).text()).toContain('Campo obbligatorio.')

    await select(wrapper, 'galleria')
    expect(wrapper.findAll('[data-testid="careers-gallery-item"]')).toHaveLength(2)
    await wrapper.find('[data-testid="careers-field-gallery-alt-1"]').setValue('Pranzo in terrazza')
    await wrapper.find('[data-testid="careers-gallery-remove-0"]').trigger('click')
    expect(form(wrapper).text()).toContain('Servono almeno 2 immagini.')
    await pickFirst(wrapper, 'careers-gallery-add')
    expect(wrapper.findAll('[data-testid="careers-gallery-item"]')).toHaveLength(2)
    await pickFirst(wrapper, 'careers-media-pick-gallery-0')
    expect(form(wrapper).text()).not.toContain('Servono almeno 2 immagini.')
  })

  it('edits values with the icon picker, testimonials with a photo, links and the jobs intro', async () => {
    const wrapper = await mountEditor()
    await select(wrapper, 'valori')
    await wrapper.find('[data-testid="careers-field-values-icon-0"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    document.body.querySelector<HTMLElement>('[data-testid="careers-icon-rocket"]')?.click()
    await flushPromises()
    expect(wrapper.find('[data-testid="careers-field-values-icon-0"]').text()).toBe('Razzo')
    await wrapper.find('[data-testid="careers-values-add"]').trigger('click')
    await wrapper.find('[data-testid="careers-field-values-title-3"]').setValue('Buoni pasto')
    await wrapper.find('[data-testid="careers-field-values-text-3"]').setValue('Ogni giorno lavorato.')
    expect(site(wrapper, 'site-values').text()).toContain('Buoni pasto')

    await select(wrapper, 'persone')
    await wrapper.find('[data-testid="careers-field-testimonials-name-0"]').setValue('Giulia B.')
    await wrapper.find('[data-testid="careers-field-testimonials-role-0"]').setValue('Backend')
    expect(site(wrapper, 'site-testimonials').text()).toContain('Giulia B.')
    const clear = form(wrapper).findAll('button').find((button) => button.text() === 'Rimuovi')
    await clear?.trigger('click')
    await pickFirst(wrapper, 'careers-media-pick-photo-0')
    await wrapper.find('[data-testid="careers-testimonials-add"]').trigger('click')
    expect(state(wrapper)).toBe('2 problemi da correggere')

    await select(wrapper, 'link')
    await wrapper.find('select[data-testid="careers-field-links-kind-0"]').setValue('github')
    await wrapper.find('[data-testid="careers-field-links-url-0"]').setValue('javascript:alert(1)')
    expect(form(wrapper).text()).toContain('Scrivi un indirizzo web completo')
    await wrapper.find('[data-testid="careers-field-links-url-0"]').setValue('https://github.com/acme')
    await wrapper.find('[data-testid="careers-field-links-label-0"]').setValue('Il nostro codice')
    await wrapper.find('[data-testid="careers-links-add"]').trigger('click')
    expect(wrapper.findAll('[data-testid="careers-links-item"]')).toHaveLength(3)

    await select(wrapper, 'jobs')
    expect(wrapper.find('[data-testid="careers-jobs-note"]').text()).toContain('I tempi di risposta non compaiono')
    await wrapper.find('[data-testid="careers-field-intro"]').setValue('Cerchiamo persone curiose.')
    expect(site(wrapper, 'site-jobs').text()).toContain('Cerchiamo persone curiose.')
  })

  it('switches a video between an upload and a link, and sets the default language', async () => {
    const wrapper = await mountEditor()
    await select(wrapper, 'video')
    expect(wrapper.find<HTMLInputElement>('[data-testid="careers-field-video-url"]').element.value).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    await wrapper.find('select[data-testid="careers-field-video-source"]').setValue('upload')
    expect(wrapper.find('[data-testid="careers-field-video-url"]').exists()).toBe(false)
    await pickFirst(wrapper, 'careers-media-pick')
    await pickFirst(wrapper, 'careers-media-pick-poster')
    expect(form(wrapper).find('[role="alert"]').exists()).toBe(false)
    await wrapper.find('select[data-testid="careers-field-video-source"]').setValue('link')
    await wrapper.find('[data-testid="careers-field-video-url"]').setValue('https://vimeo.com/76979871')
    await wrapper.find('[data-testid="careers-field-caption"]').setValue('Due minuti in ufficio')
    expect(site(wrapper, 'site-video').text()).toContain('Due minuti in ufficio')

    await wrapper.find('select[data-testid="careers-field-default-locale"]').setValue('en')
    expect(state(wrapper)).toBe('Modifiche non salvate')
  })

  it('reorders by dragging the grip, with an insertion line, and never above the hero', async () => {
    const wrapper = await mountEditor()
    const list = wrapper.find('[data-testid="careers-sections"] ol')
    const rowEls = list.findAll('[data-drag-row]')
    rowEls.forEach((row, index) => {
      vi.spyOn(row.element, 'getBoundingClientRect').mockReturnValue({ top: index * 40, height: 40, bottom: index * 40 + 40, left: 0, right: 100, width: 100, x: 0, y: index * 40, toJSON: () => ({}) })
    })
    await rowEls[1]!.find('[data-testid="careers-section-grip"]').trigger('pointerdown', { button: 0, clientY: 50, pointerId: 1 })
    await list.trigger('pointermove', { clientY: 155 })
    expect(wrapper.find('[data-testid="careers-drop-line"]').exists()).toBe(true)
    await list.trigger('pointerup', { clientY: 155 })
    expect(wrapper.findAll('[data-testid="careers-section-row"]').map((row) => row.attributes('data-section-id')).slice(0, 4)).toEqual(['hero', 'ufficio', 'galleria', 'chi-siamo'])
    expect(wrapper.find('[data-testid="careers-sections-live"]').text()).toBe('Sezione spostata in posizione 4 di 10')

    await wrapper.findAll('[data-testid="careers-section-grip"]')[0]!.trigger('pointerdown', { button: 0, clientY: 50, pointerId: 1 })
    await list.trigger('pointerup', { clientY: 0 })
    expect(wrapper.findAll('[data-testid="careers-section-row"]')[0]!.attributes('data-section-id')).toBe('hero')
    await wrapper.findAll('[data-testid="careers-section-grip"]')[0]!.trigger('pointerdown', { button: 0, clientY: 50, pointerId: 1 })
    await list.trigger('pointercancel')
    expect(wrapper.find('[data-testid="careers-drop-line"]').exists()).toBe(false)
  })
})
