import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consentOrganization, consentPreview, SIGNED_QUERY } from '~~/test/fixtures/connected-app-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import Authorize from './authorize.vue'
import Consent from './consent.vue'

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback?code=abc&state=s1'

const state = vi.hoisted(() => ({
  calls: [] as { path: string; body: unknown }[],
  preview: null as unknown,
  previewStatus: 200,
  consentStatus: 200,
  consentBody: null as unknown,
  continueUrl: '/oauth/consent?x=1',
}))
const mocks = vi.hoisted(() => ({ navigateTo: vi.fn() }))
mockNuxtImport('navigateTo', () => mocks.navigateTo)

const record = (path: string) => async (event: Parameters<typeof readBody>[0]) => {
  state.calls.push({ path, body: await readBody(event) })
}
registerEndpoint('/api/v1/connected-apps/consent-preview', {
  method: 'POST',
  handler: async (event) => {
    await record('preview')(event)
    if (state.previewStatus !== 200) {
      setResponseStatus(event, state.previewStatus)
      return { success: false, data: null, error: { code: 'invalid_request', message: 'expired' } }
    }
    return ok(state.preview)
  },
})
registerEndpoint('/api/auth/organization/set-active', { method: 'POST', handler: async (event) => (await record('set-active')(event), { id: 'o2' }) })
registerEndpoint('/api/auth/oauth2/consent', {
  method: 'POST',
  handler: async (event) => {
    await record('consent')(event)
    setResponseStatus(event, state.consentStatus)
    return state.consentBody
  },
})
registerEndpoint('/api/auth/oauth2/continue', { method: 'POST', handler: async (event) => (await record('continue')(event), { redirect: true, url: state.continueUrl }) })

const mounted: { unmount: () => void }[] = []
const mountPage = async (page: typeof Consent | typeof Authorize, path: string) => {
  const wrapper = await mountSuspended(page, { route: path, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
const mountConsent = async () => {
  const wrapper = await mountPage(Consent, `/oauth/consent?${SIGNED_QUERY}`)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="consent-title"]').exists()).toBe(true))
  return wrapper
}
const bodiesOf = (path: string) => state.calls.filter((call) => call.path === path).map((call) => call.body)

beforeEach(() => {
  vi.clearAllMocks()
  state.calls = []
  state.preview = consentPreview()
  state.previewStatus = 200
  state.consentStatus = 200
  state.consentBody = { redirect: true, url: CALLBACK }
  state.continueUrl = '/oauth/consent?x=1'
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('consent page', () => {
  it('shows the declared app, the host it goes back to, the organization and what the connector can do', async () => {
    const wrapper = await mountConsent()
    expect(bodiesOf('preview')).toEqual([{ oauthQuery: SIGNED_QUERY }])
    expect(wrapper.find('[data-testid="consent-title"]').text()).toBe('Claude vuole lavorare con il tuo account')
    expect(wrapper.text()).toContain("Nome e indirizzo li dichiara l'app stessa")
    expect(wrapper.find('[data-testid="consent-client-uri"]').text()).toBe('https://claude.ai')
    expect(wrapper.find('[data-testid="consent-host"]').text()).toBe('claude.ai')
    expect(wrapper.find<HTMLSelectElement>('select[data-testid="consent-organization"]').element.value).toBe('o1')
    const permissions = wrapper.find('[data-testid="consent-permissions"]')
    expect(permissions.text()).toContain('Come Recruiter in Acme')
    expect(permissions.find('[data-scope="job:read"]').exists()).toBe(true)
    expect(permissions.find('[data-scope="message:send"]').exists()).toBe(false)
    expect(permissions.find('[data-scope="candidate:decide"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="consent-never"]').text()).toContain('gestire membri, chiavi o impostazioni')
    expect(wrapper.find('[data-testid="consent-as-you"]').text()).toContain('registro delle azioni')
  })

  it('allows in the active organization without switching, then follows the answer', async () => {
    const wrapper = await mountConsent()
    await wrapper.find('[data-testid="consent-allow"]').trigger('click')
    await vi.waitFor(() => expect(mocks.navigateTo).toHaveBeenCalledWith(CALLBACK, { external: true }))
    expect(state.calls.map((call) => call.path)).toEqual(['preview', 'consent'])
    expect(bodiesOf('consent')).toEqual([{ accept: true, oauth_query: SIGNED_QUERY }])
  })

  it('switches the active organization first when another one is picked', async () => {
    const wrapper = await mountConsent()
    await wrapper.find('select[data-testid="consent-organization"]').setValue('o2')
    expect(wrapper.find('[data-testid="consent-permissions"]').text()).toContain('Come Intervistatore in Globex')
    await wrapper.find('[data-testid="consent-allow"]').trigger('click')
    await vi.waitFor(() => expect(mocks.navigateTo).toHaveBeenCalledWith(CALLBACK, { external: true }))
    expect(state.calls.map((call) => call.path)).toEqual(['preview', 'set-active', 'consent'])
    expect(bodiesOf('set-active')).toEqual([{ organizationId: 'o2' }])
  })

  it('denies without switching anything', async () => {
    state.consentBody = { redirect: true, url: 'https://claude.ai/api/mcp/auth_callback?error=access_denied' }
    const wrapper = await mountConsent()
    await wrapper.find('[data-testid="consent-deny"]').trigger('click')
    await vi.waitFor(() => expect(mocks.navigateTo).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?error=access_denied', { external: true }))
    expect(bodiesOf('consent')).toEqual([{ accept: false, oauth_query: SIGNED_QUERY }])
  })

  it('blocks allow for an organization that requires two-factor authentication first', async () => {
    state.preview = consentPreview({ organizations: [consentOrganization('o1', { active: true, twoFactorRequired: true })] })
    const wrapper = await mountConsent()
    expect(wrapper.find('[data-testid="consent-allow"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="consent-two-factor"]').text()).toContain('Acme chiede la verifica in due passaggi')
    expect(wrapper.find('[data-testid="consent-two-factor-link"]').attributes('href')).toBe('/app/settings/security')
    expect(wrapper.find('[data-testid="consent-organization"] option').text()).toContain('serve la verifica in due passaggi')
  })

  it('reports a refusal of the server where screen readers hear it, and stays on the page', async () => {
    state.consentStatus = 403
    state.consentBody = { code: 'TWO_FACTOR_REQUIRED', message: 'no' }
    const wrapper = await mountConsent()
    await wrapper.find('[data-testid="consent-allow"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').text()).toContain('chiede la verifica in due passaggi'))
    expect(wrapper.find('[aria-live="assertive"] [role="alert"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="consent-two-factor-link"]').exists()).toBe(true)
    expect(mocks.navigateTo).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="consent-allow"]').attributes('disabled')).toBeUndefined()
  })

  it('never follows an unsafe address', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    state.consentBody = { redirect: true, url: 'javascript:alert(1)' }
    const wrapper = await mountConsent()
    await wrapper.find('[data-testid="consent-deny"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').text()).toContain('Qualcosa non ha funzionato'))
    expect(mocks.navigateTo).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('says what is missing to a person without an organization', async () => {
    state.preview = consentPreview({ organizations: [] })
    const wrapper = await mountConsent()
    expect(wrapper.find('[data-testid="consent-no-organization"]').text()).toContain('Non fai ancora parte di nessuna organizzazione')
    expect(wrapper.find('[data-testid="consent-allow"]').attributes('disabled')).toBeDefined()
  })

  it('asks to start again when the request expired', async () => {
    state.previewStatus = 400
    const wrapper = await mountPage(Consent, `/oauth/consent?${SIGNED_QUERY}`)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="oauth-failed"]').exists()).toBe(true))
    expect(wrapper.text()).toContain('Avvia di nuovo il collegamento dalla tua app')
  })
})

describe('authorize page', () => {
  it('continues after login with the signed query and follows the answer', async () => {
    await mountPage(Authorize, `/oauth/authorize?${SIGNED_QUERY}`)
    await vi.waitFor(() => expect(mocks.navigateTo).toHaveBeenCalledWith('/oauth/consent?x=1', { external: true }))
    expect(bodiesOf('continue')).toEqual([{ postLogin: true, oauth_query: SIGNED_QUERY }])
  })

  it('asks to start again without a request', async () => {
    const wrapper = await mountPage(Authorize, '/oauth/authorize')
    await flushPromises()
    expect(wrapper.find('[data-testid="oauth-failed"]').text()).toContain('Avvia di nuovo il collegamento dalla tua app')
    expect(state.calls).toEqual([])
  })
})
