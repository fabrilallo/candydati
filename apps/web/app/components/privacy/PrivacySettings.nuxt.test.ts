import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notice, PRIVACY_TEXT } from '~~/test/fixtures/candidate-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import PrivacyMissingBanner from './PrivacyMissingBanner.vue'
import PrivacyRequiredAlert from './PrivacyRequiredAlert.vue'
import PrivacySettings from './PrivacySettings.vue'

const TEMPLATE = `Modello per Acme. ${'Testo di esempio. '.repeat(20)}`
const state = vi.hoisted(() => ({ active: null as unknown, versions: [] as unknown[], published: null as unknown, templates: [] as string[] }))
registerEndpoint('/api/v1/privacy-notice', { method: 'GET', handler: () => ok(state.active) })
registerEndpoint('/api/v1/privacy-notice', {
  method: 'POST',
  handler: async (event) => {
    state.published = await readBody(event)
    state.active = notice({ id: 'pn4', version: 4 })
    state.versions = [state.active, ...state.versions]
    return ok(state.active)
  },
})
registerEndpoint('/api/v1/privacy-notice/versions', () => ok(state.versions))
registerEndpoint('/api/v1/privacy-notice/template', (event) => {
  state.templates.push((event.node.req.url ?? '').replace(/^\/_/, ''))
  return ok({ text: TEMPLATE })
})

const mounted: { unmount: () => void }[] = []
const track = <T extends { unmount: () => void }>(wrapper: T): T => (mounted.push(wrapper), wrapper)
const mountSettings = async () => {
  const wrapper = track(await mountSuspended(PrivacySettings, { attachTo: document.body }))
  await vi.waitFor(() => expect(wrapper.find('[data-testid="privacy-editor"]').exists()).toBe(true))
  return wrapper
}
const confirmButton = () => [...document.body.querySelectorAll<HTMLElement>('[data-testid="confirm"]')].at(-1)

beforeEach(() => {
  state.active = null
  state.versions = []
  state.published = null
  state.templates = []
  clearNuxtData('privacy-settings')
  clearNuxtData('privacy-active')
  useState('privacy-banner-dismissed').value = false
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('PrivacySettings', () => {
  it('starts the first version from the template and the default retention', async () => {
    const wrapper = await mountSettings()
    expect(wrapper.find('[data-testid="privacy-none"]').exists()).toBe(true)
    expect(state.templates).toEqual(['/api/v1/privacy-notice/template?language=it'])
    expect((wrapper.find('[data-testid="privacy-text-input"]').element as HTMLTextAreaElement).value).toBe(TEMPLATE)
    expect((wrapper.find('[data-testid="privacy-selection"]').element as HTMLInputElement).value).toBe('365')
    expect(wrapper.text()).toContain('Cioè 1 anno dalla candidatura.')
    expect(wrapper.text()).toContain('Cioè 2 anni, se la persona accetta')
    expect(wrapper.find('[data-testid="privacy-versions"]').exists()).toBe(false)
  })

  it('validates before asking for confirmation', async () => {
    const wrapper = await mountSettings()
    await wrapper.find('[data-testid="privacy-selection"]').setValue('5')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Inserisci un indirizzo email valido')
    expect(wrapper.text()).toContain('Indica un numero di giorni tra 30 e 1825')
    expect(confirmButton()).toBeUndefined()
  })

  it('publishes a new version after confirmation and lists it', async () => {
    const wrapper = await mountSettings()
    await wrapper.find('[data-testid="privacy-contact"]').setValue('privacy@acme.test')
    await wrapper.find('[data-testid="privacy-pool"]').setValue('180')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(document.body.textContent).toContain('Pubblicare la versione 1?')
    expect(document.body.textContent).toContain('Ogni versione resta consultabile; le nuove candidature useranno questa.')
    confirmButton()?.click()
    await vi.waitFor(() => expect(state.published).toEqual({ language: 'it', text: TEMPLATE.trim(), contactEmail: 'privacy@acme.test', retentionDays: { selection: 365, talent_pool: 180 } }))
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="privacy-version"]')).toHaveLength(1))
    expect(wrapper.find('[data-testid="privacy-current"]').text()).toContain('Versione 4')
  })

  it('starts the next version from the active one and shows the history', async () => {
    state.active = notice()
    state.versions = [notice(), notice({ id: 'pn2', version: 2 })]
    const wrapper = await mountSettings()
    expect(state.templates).toEqual([])
    expect((wrapper.find('[data-testid="privacy-text-input"]').element as HTMLTextAreaElement).value).toBe(PRIVACY_TEXT)
    expect(wrapper.find('[data-testid="privacy-publish"]').text()).toBe('Pubblica la versione 4')
    expect(wrapper.findAll('[data-testid="privacy-version"]').map((node) => node.find('summary').text())).toEqual([expect.stringContaining('Versione 3'), expect.stringContaining('Versione 2')])
    expect(wrapper.find('[data-testid="privacy-version"] summary').text()).toContain('In uso')
  })

  it('replaces the text with the template only after confirmation', async () => {
    state.active = notice()
    state.versions = [notice()]
    const wrapper = await mountSettings()
    await wrapper.find('[data-testid="use-template"]').trigger('click')
    await flushPromises()
    confirmButton()?.click()
    await vi.waitFor(() => expect((wrapper.find('[data-testid="privacy-text-input"]').element as HTMLTextAreaElement).value).toBe(TEMPLATE))
  })
})

describe('PrivacyMissingBanner', () => {
  it('reminds admins while no notice exists, and can be dismissed', async () => {
    const wrapper = track(await mountSuspended(PrivacyMissingBanner))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="privacy-banner"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="privacy-banner-link"]').attributes('href')).toBe('/app/settings/privacy')
    await wrapper.find('[data-testid="privacy-banner-dismiss"]').trigger('click')
    expect(wrapper.find('[data-testid="privacy-banner"]').exists()).toBe(false)
  })

  it('stays away once a notice exists', async () => {
    state.active = notice()
    const wrapper = track(await mountSuspended(PrivacyMissingBanner))
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(wrapper.find('[data-testid="privacy-banner"]').exists()).toBe(false)
  })
})

describe('PrivacyRequiredAlert', () => {
  it('links admins to the settings and tells others whom to ask', async () => {
    const admin = track(await mountSuspended(PrivacyRequiredAlert))
    expect(admin.find('a').attributes('href')).toBe('/app/settings/privacy')
    useViewer().viewer.value = viewerWith('recruiter')
    const recruiter = track(await mountSuspended(PrivacyRequiredAlert))
    expect(recruiter.find('a').exists()).toBe(false)
    expect(recruiter.text()).toContain('Chiedi a una persona amministratrice')
  })
})
