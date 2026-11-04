import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectedApp } from '~~/test/fixtures/connected-app-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import ConnectedAppsPanel from './ConnectedAppsPanel.vue'

const state = vi.hoisted(() => ({ apps: [] as unknown[], revoked: [] as string[] }))
registerEndpoint('/api/v1/connected-apps', { method: 'GET', handler: () => ok(state.apps) })
registerEndpoint('/api/v1/connected-apps/g1', { method: 'DELETE', handler: () => (state.revoked.push('g1'), ok(connectedApp('g1'))) })

const mounted: { unmount: () => void }[] = []
const byTestId = <T extends HTMLElement = HTMLElement>(testId: string) => document.body.querySelector<T>(`[data-testid="${testId}"]`)
const mountPanel = async () => {
  const wrapper = await mountSuspended(ConnectedAppsPanel, { attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
beforeEach(() => {
  state.apps = [connectedApp('g1'), connectedApp('g2', { clientName: null, userId: 'u2', userName: 'Grace Hopper' }), connectedApp('g3', { userId: 'u3', userName: null })]
  state.revoked = []
  clearNuxtData()
  useViewer().viewer.value = viewerWith('admin')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('connected apps panel', () => {
  it('lists each app with its declared name, who connected it when not me, the date and its access', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="connected-app"]').length).toBe(3))
    const [mine, other, former] = wrapper.findAll('[data-testid="connected-app"]')
    expect(mine?.find('[data-testid="connected-app-name"]').text()).toBe('Claude')
    expect(mine?.text()).toContain("nome dichiarato dall'app")
    expect(mine?.find('[data-testid="connected-app-meta"]').text()).not.toContain('Collegata da')
    expect(mine?.text()).toContain('Collegata il')
    expect(mine?.text()).toContain('Strumenti MCP')
    expect(other?.find('[data-testid="connected-app-name"]').text()).toBe('App senza nome')
    expect(other?.text()).toContain('Collegata da Grace Hopper')
    expect(former?.text()).toContain('Collegata da un ex membro')
    expect(wrapper.text()).toContain('Acme')
  })

  it('explains how to connect when there is none, with the guide only for who can open it', async () => {
    state.apps = []
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="connected-apps-empty"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="connected-apps-empty"]').text()).toContain('/mcp')
    expect(wrapper.find('a[href="/app/settings/api"]').exists()).toBe(true)
    wrapper.unmount()
    mounted.splice(0)

    clearNuxtData()
    useViewer().viewer.value = viewerWith('recruiter')
    const recruiter = await mountPanel()
    await vi.waitFor(() => expect(recruiter.find('[data-testid="connected-apps-empty"]').exists()).toBe(true))
    expect(recruiter.find('a[href="/app/settings/api"]').exists()).toBe(false)
  })

  it('disconnects an app after a confirmation and drops it from the list', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="connected-app"]').length).toBe(3))
    await wrapper.find('[data-app-id="g1"] [data-testid="connected-app-revoke"]').trigger('click')
    await vi.waitFor(() => expect(byTestId('confirm')).not.toBeNull())
    expect(document.body.textContent).toContain('Claude smette subito di funzionare')
    byTestId<HTMLButtonElement>('confirm')?.click()
    await vi.waitFor(() => expect(state.revoked).toEqual(['g1']))
    await vi.waitFor(() => expect(wrapper.find('[data-app-id="g1"]').exists()).toBe(false))
    expect(wrapper.findAll('[data-testid="connected-app"]').length).toBe(2)
  })
})
