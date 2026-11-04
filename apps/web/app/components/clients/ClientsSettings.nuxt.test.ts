import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { client } from '~~/test/fixtures/client-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import Page from '../../pages/app/settings/clients.vue'

const state = vi.hoisted(() => ({
  setting: { recruitsForClients: false, agencyAuthorization: null as string | null },
  clients: [] as unknown[],
  puts: [] as unknown[],
  posts: [] as unknown[],
  postStatus: 201,
}))
registerEndpoint('/api/v1/settings/agency', { method: 'GET', handler: () => ok(state.setting) })
registerEndpoint('/api/v1/settings/agency', {
  method: 'PUT',
  handler: async (event) => {
    const body = await readBody<typeof state.setting>(event)
    state.puts.push(body)
    state.setting = body
    return ok(body)
  },
})
registerEndpoint('/api/v1/clients', { method: 'GET', handler: () => ok(state.clients) })
registerEndpoint('/api/v1/clients', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody(event)
    state.posts.push(body)
    if (state.postStatus !== 201) {
      setResponseStatus(event, state.postStatus)
      return { success: false, data: null, error: { code: 'conflict', message: 'x' } }
    }
    state.clients = [...state.clients, client({ id: 'c2', name: 'Beta' })]
    return ok(client({ id: 'c2', name: 'Beta' }))
  },
})

const mounted: { unmount: () => void }[] = []
const byTestId = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const mountPage = async () => {
  const wrapper = await mountSuspended(Page, { route: '/app/settings/clients', attachTo: document.body })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}
const type = async (id: string, value: string): Promise<void> => {
  const input = byTestId(id) as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

beforeEach(() => {
  state.setting = { recruitsForClients: false, agencyAuthorization: null }
  state.clients = [client(), client({ id: 'old', name: 'Vecchio', archived: true, jobCount: 0 })]
  state.puts = []
  state.posts = []
  state.postStatus = 201
  clearNuxtData()
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('clients settings', () => {
  it('lets an owner turn it on with the authorization reference, and only then lists the clients', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="clients-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="agency-explain"]').text()).toContain('non compare nulla')
    await wrapper.find('[data-testid="agency-toggle"]').setValue(true)
    expect(wrapper.find('[data-testid="agency-explain"]').text()).toContain('mai un altro nome')
    await wrapper.find('[data-testid="agency-authorization"]').setValue(' Aut. Min. 123 ')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(state.puts).toEqual([{ recruitsForClients: true, agencyAuthorization: 'Aut. Min. 123' }]))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="clients-panel"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="agency-missing-reference"]').exists()).toBe(false)
  })

  it('warns when the setting is on without a reference, and hides archived clients until asked', async () => {
    state.setting = { recruitsForClients: true, agencyAuthorization: null }
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="agency-missing-reference"]').exists()).toBe(true)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="client-row"]')).toHaveLength(1))
    expect(wrapper.find('[data-testid="client-row"]').text()).toContain('Acme Spa')
    expect(wrapper.find('[data-testid="client-row"]').text()).toContain('2 annunci')
    await wrapper.find('[data-testid="clients-show-archived"]').setValue(true)
    expect(wrapper.findAll('[data-testid="client-row"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="client-archived"]').text()).toBe('Archiviato')
  })

  it('reads only, for who may not change the setting nor the clients', async () => {
    state.setting = { recruitsForClients: true, agencyAuthorization: 'Aut. 1' }
    useViewer().viewer.value = viewerWith('hiring_manager')
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="agency-toggle"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="agency-read-only"]').exists()).toBe(true)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="client-row"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="client-new"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="client-edit-c1"]').exists()).toBe(false)
  })

  it('creates a client with a contact, and says what is wrong first', async () => {
    state.setting = { recruitsForClients: true, agencyAuthorization: 'Aut. 1' }
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="client-new"]').exists()).toBe(true))
    await wrapper.find('[data-testid="client-new"]').trigger('click')
    await flushPromises()
    const form = byTestId('client-form') as HTMLFormElement
    await type('client-website', 'nope')
    form.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(form.textContent).toContain('Scrivi il nome del cliente')
    expect(form.textContent).toContain('https://')
    expect(state.posts).toEqual([])
    await type('client-name', 'Beta')
    await type('client-website', '')
    byTestId('client-add-contact')?.click()
    await flushPromises()
    const [name, email] = [...form.querySelectorAll<HTMLInputElement>('[data-testid="client-contact"] input')]
    name!.value = 'Luca'
    name!.dispatchEvent(new Event('input'))
    email!.value = 'luca@beta.example'
    email!.dispatchEvent(new Event('input'))
    await flushPromises()
    form.dispatchEvent(new Event('submit'))
    await vi.waitFor(() => expect(state.posts).toEqual([{ name: 'Beta', website: null, logoUrl: null, contacts: [{ name: 'Luca', email: 'luca@beta.example' }] }]))
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="client-row"]')).toHaveLength(2))
  })

  it('names a duplicate client', async () => {
    state.setting = { recruitsForClients: true, agencyAuthorization: 'Aut. 1' }
    state.postStatus = 409
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="client-new"]').exists()).toBe(true))
    await wrapper.find('[data-testid="client-new"]').trigger('click')
    await flushPromises()
    await type('client-name', 'Acme Spa')
    byTestId('client-form')?.dispatchEvent(new Event('submit'))
    await vi.waitFor(() => expect(byTestId('client-form')?.textContent).toContain('Esiste già un cliente con questo nome'))
  })
})
