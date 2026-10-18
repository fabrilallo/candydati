import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { CAREERS_FIXTURE_MEDIA as M, type OrganizationLogoDto, type OrganizationLogoSource } from '@candydati/domain'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editorDto, fixtureAssets, publicCareers } from '~~/test/fixtures/careers-editor-fixtures'
import { instanceEmail } from '~~/test/fixtures/instance-email-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import CareersPageEditor from './CareersPageEditor.vue'

const LIBRARY_URL = `/api/v1/public/organizations/acme/careers-media/${M.image2}/0123456789abcdef-w640.webp`
const state = vi.hoisted(() => ({ logo: { source: null, url: null } as OrganizationLogoDto, puts: [] as (OrganizationLogoSource | null)[] }))
const urlOf = (source: OrganizationLogoSource | null): string | null => (source === null ? null : source.kind === 'url' ? source.url : LIBRARY_URL)

registerEndpoint('/api/v1/instance/email-settings', { method: 'GET', handler: () => ok(instanceEmail()) })
registerEndpoint('/api/v1/careers-page', { method: 'GET', handler: () => ok(editorDto()) })
registerEndpoint('/api/v1/careers-page/media', { method: 'GET', handler: () => ok(fixtureAssets()) })
registerEndpoint('/api/v1/public/organizations/acme/jobs', () => ok(publicCareers()))
registerEndpoint('/api/v1/organization/logo', { method: 'GET', handler: () => ok(state.logo) })
registerEndpoint('/api/v1/organization/logo', {
  method: 'PUT',
  handler: async (event) => {
    const { source } = await readBody<{ source: OrganizationLogoSource | null }>(event)
    state.puts.push(source)
    state.logo = { source, url: urlOf(source) }
    return ok(state.logo)
  },
})

const mounted: { unmount: () => void }[] = []
const mountEditor = async () => {
  const wrapper = await mountSuspended(CareersPageEditor, { route: '/app/settings/careers', attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="careers-logo"]').exists()).toBe(true))
  await flushPromises()
  return wrapper
}
type Wrapper = Awaited<ReturnType<typeof mountEditor>>
const panel = (wrapper: Wrapper) => wrapper.find('[data-testid="careers-logo"]')
const previewLogo = (wrapper: Wrapper) => wrapper.find('[data-testid="careers-preview"] [data-testid="site-topbar"] img')

beforeEach(() => {
  state.logo = { source: null, url: null }
  state.puts.length = 0
  clearNuxtData()
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('careers page editor: logo', () => {
  it('starts with the initials, then makes a library image the logo at once, in the preview too', async () => {
    const wrapper = await mountEditor()
    expect(panel(wrapper).text()).toContain('Nessun logo')
    expect(previewLogo(wrapper).exists()).toBe(false)

    await wrapper.find('[data-testid="careers-logo-choose"]').trigger('click')
    await flushPromises()
    const item = document.body.querySelector<HTMLElement>(`[data-testid="careers-media-item"][data-media-id="${M.image2}"] [data-testid="careers-media-select"]`)
    item?.click()
    await flushPromises()

    expect(state.puts).toEqual([{ kind: 'media', mediaId: M.image2 }])
    await vi.waitFor(() => expect(wrapper.find('[data-testid="careers-logo-image"]').attributes('src')).toBe(LIBRARY_URL))
    expect(previewLogo(wrapper).attributes('src')).toBe(LIBRARY_URL)
    expect(wrapper.find('[data-testid="careers-logo-choose"]').text()).toBe('Cambia immagine')
  })

  it('takes an https address and refuses any other without asking the api', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="careers-logo-url-toggle"]').trigger('click')
    await wrapper.find('[data-testid="careers-logo-url"]').setValue('http://cdn.example/logo.png')
    await wrapper.find('[data-testid="careers-logo-url-apply"]').trigger('submit')
    await flushPromises()
    expect(state.puts).toEqual([])
    expect(panel(wrapper).find('[role="alert"]').text()).toBe('Serve un indirizzo che inizi con https://')

    await wrapper.find('[data-testid="careers-logo-url"]').setValue('https://cdn.example/logo.png')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(state.puts).toEqual([{ kind: 'url', url: 'https://cdn.example/logo.png' }])
    await vi.waitFor(() => expect(wrapper.find('[data-testid="careers-logo-image"]').attributes('src')).toBe('https://cdn.example/logo.png'))
  })

  it('removes the logo', async () => {
    state.logo = { source: { kind: 'url', url: 'https://cdn.example/logo.png' }, url: 'https://cdn.example/logo.png' }
    const wrapper = await mountEditor()
    expect(wrapper.find<HTMLInputElement>('[data-testid="careers-logo-url"]').element.value).toBe('https://cdn.example/logo.png')
    await wrapper.find('[data-testid="careers-logo-remove"]').trigger('click')
    await flushPromises()
    expect(state.puts).toEqual([null])
    await vi.waitFor(() => expect(wrapper.find('[data-testid="careers-logo-image"]').exists()).toBe(false))
    expect(previewLogo(wrapper).exists()).toBe(false)
  })
})
