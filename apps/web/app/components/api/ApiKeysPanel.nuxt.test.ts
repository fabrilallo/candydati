import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { apiKey } from '~~/test/fixtures/phase6-fixtures'
import ApiKeysPanel from './ApiKeysPanel.vue'

const state = vi.hoisted(() => ({ created: [] as unknown[], revoked: 0 }))
registerEndpoint('/api/v1/api-keys', async (event) => {
  if (event.method !== 'POST') return ok([apiKey('k1'), apiKey('k0', { name: 'Vecchia', revokedAt: '2026-10-02T09:00:00.000Z' })])
  const body = await readBody<{ name: string; scopes: string[] }>(event)
  state.created.push(body)
  return ok({ key: apiKey('k2', { name: body.name, scopes: body.scopes, lastUsedAt: null }), secret: 'candydati_Zz99Yy88_once' })
})
registerEndpoint('/api/v1/api-keys/k1', { method: 'DELETE', handler: () => (state.revoked += 1, ok(apiKey('k1', { revokedAt: '2026-10-13T10:00:00.000Z' }))) })

const mounted: { unmount: () => void }[] = []
const byTestId = <T extends HTMLElement = HTMLElement>(testId: string) => document.body.querySelector<T>(`[data-testid="${testId}"]`)
const mountPanel = async () => {
  const wrapper = await mountSuspended(ApiKeysPanel, { attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.findAll('[data-testid="api-key-item"]').length).toBe(2))
  return wrapper
}
beforeEach(() => {
  state.created.length = 0
  state.revoked = 0
  clearNuxtData()
  useViewer().viewer.value = viewerWith('admin')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('api keys', () => {
  it('lists keys with prefix, scopes, creator, last use and status', async () => {
    const wrapper = await mountPanel()
    const [first, second] = wrapper.findAll('[data-testid="api-key-item"]')
    expect(first?.text()).toContain('Integrazione CI')
    expect(first?.text()).toContain('candydati_Ab12Cd34')
    expect(first?.text()).toContain('Leggere gli annunci')
    expect(first?.text()).toContain('Creata da Ada Lovelace')
    expect(first?.text()).toContain('Ultimo uso il')
    expect(first?.find('[data-testid="api-key-status"]').text()).toBe('Attiva')
    expect(second?.find('[data-testid="api-key-status"]').text()).toBe('Revocata')
    expect(second?.find('[data-testid="api-key-revoke"]').exists()).toBe(false)
  })

  it('offers only grantable scopes, explains what stays with a person, and shows the secret once until confirmed', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="api-key-add"]').trigger('click')
    await vi.waitFor(() => expect(byTestId('api-key-name')).not.toBeNull())
    expect(byTestId('api-key-scope-job:create')).not.toBeNull()
    expect(byTestId('api-key-scope-message:send')).toBeNull()
    expect(byTestId('api-key-scope-candidate:decide')).toBeNull()
    expect(byTestId('api-key-scope-api_key:manage')).toBeNull()
    expect(byTestId('api-key-withheld')?.textContent).toContain('decisioni sui candidati, messaggi ai candidati e amministrazione')

    document.body.querySelector<HTMLFormElement>('#api-key-form')?.requestSubmit()
    await flushPromises()
    expect(byTestId('api-key-dialog')?.textContent).toContain('Dai un nome alla chiave')
    expect(byTestId('api-key-dialog')?.textContent).toContain('Scegli almeno un permesso')

    const name = byTestId<HTMLInputElement>('api-key-name')
    if (!name) throw new Error('no name field')
    name.value = 'Agente HR'
    name.dispatchEvent(new Event('input'))
    byTestId<HTMLInputElement>('api-key-scope-job:read')?.click()
    byTestId<HTMLInputElement>('api-key-scope-job:create')?.click()
    await flushPromises()
    document.body.querySelector<HTMLFormElement>('#api-key-form')?.requestSubmit()
    await vi.waitFor(() => expect(byTestId('api-key-secret')?.textContent).toBe('candydati_Zz99Yy88_once'))
    // Every key expires: 90 days unless another choice is made.
    expect(state.created).toEqual([{ name: 'Agente HR', scopes: ['job:read', 'job:create'], expiresAt: expect.any(String) }])
    const days = (Date.parse((state.created[0] as { expiresAt: string }).expiresAt) - Date.now()) / 86_400_000
    expect(Math.round(days)).toBe(90)
    expect(byTestId<HTMLButtonElement>('api-key-done')?.disabled).toBe(true)
    byTestId<HTMLInputElement>('api-key-stored')?.click()
    await flushPromises()
    expect(byTestId<HTMLButtonElement>('api-key-done')?.disabled).toBe(false)
    byTestId<HTMLButtonElement>('api-key-done')?.click()
    await vi.waitFor(() => expect(byTestId('api-key-secret')).toBeNull())
    expect(wrapper.findAll('[data-testid="api-key-item"]').map((item) => item.attributes('data-key-id'))).toEqual(['k2', 'k1', 'k0'])
    expect(wrapper.text()).not.toContain('candydati_Zz99Yy88_once')
  })

  it('revokes a key after a confirmation and keeps it in the list as revoked', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-key-id="k1"] [data-testid="api-key-revoke"]').trigger('click')
    await vi.waitFor(() => expect(byTestId('confirm')).not.toBeNull())
    expect(document.body.textContent).toContain('Integrazione CI smette subito di funzionare')
    byTestId<HTMLButtonElement>('confirm')?.click()
    await vi.waitFor(() => expect(state.revoked).toBe(1))
    await vi.waitFor(() => expect(wrapper.find('[data-key-id="k1"] [data-testid="api-key-status"]').text()).toBe('Revocata'))
  })
})
