import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import { connector } from '~~/test/fixtures/migration-fixtures'
import MigrationSourceStep from './MigrationSourceStep.vue'
import MigrationConnectorForm from './MigrationConnectorForm.vue'

const SECRET = 'sk_live_do_not_show_9f8e7d'
const state = vi.hoisted(() => ({ connectors: [] as unknown[], listFails: false, bodies: [] as unknown[], startFails: false }))
registerEndpoint('/api/v1/migrations/connectors', {
  method: 'GET',
  handler: (event) => {
    if (state.listFails) {
      setResponseStatus(event, 500)
      return { success: false, data: null, error: { code: 'internal', message: 'x' } }
    }
    return ok(state.connectors)
  },
})
registerEndpoint('/api/v1/migrations/connector', {
  method: 'POST',
  handler: async (event) => {
    state.bodies.push(await readBody(event))
    if (state.startFails) {
      setResponseStatus(event, 422)
      return { success: false, data: null, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'credentials.apiKey', message: 'invalid' }] } }
    }
    setResponseStatus(event, 201)
    return ok({ id: 'm42', status: 'fetching' })
  },
})

const mounted: { unmount: () => void }[] = []
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))
beforeEach(() => {
  state.connectors = []
  state.listFails = false
  state.bodies = []
  state.startFails = false
  clearNuxtData()
})

const mountSource = async () => {
  const wrapper = await mountSuspended(MigrationSourceStep)
  mounted.push(wrapper)
  return wrapper
}
const mountForm = async () => {
  const wrapper = await mountSuspended(MigrationConnectorForm, { props: { connector: connector() as never } })
  mounted.push(wrapper)
  return wrapper
}
const fill = async (wrapper: Awaited<ReturnType<typeof mountForm>>) => {
  await wrapper.find('input[name="subdomain"]').setValue('acme')
  await wrapper.find('input[name="apiKey"]').setValue(SECRET)
}

describe('connector cards in the source step', () => {
  it('shows each connector with its Beta badge, the not-verified sentence and its documentation', async () => {
    state.connectors = [connector()]
    const wrapper = await mountSource()
    await vi.waitFor(() => expect(wrapper.find('[data-connector="acme"]').exists()).toBe(true))
    const card = wrapper.find('[data-connector="acme"]')
    expect(card.find('[data-testid="connector-beta"]').text()).toBe('Beta')
    expect(card.text()).toContain('Costruito sulla documentazione pubblica di Acme ATS, non ancora verificato su un account reale: controlla l’anteprima prima di confermare.'.replace('’', "'"))
    expect(card.find('a').attributes()).toMatchObject({ href: 'https://docs.acme.example/api', target: '_blank', rel: 'noopener noreferrer' })
    await wrapper.find('[data-testid="source-connector-acme"]').trigger('click')
    expect((wrapper.emitted('connect')?.[0]?.[0] as { id: string }).id).toBe('acme')
  })

  it('shows no connector card when the installation has none, and keeps the package when the list fails', async () => {
    const empty = await mountSource()
    await vi.waitFor(() => expect(empty.find('[aria-busy="true"]').exists()).toBe(false))
    expect(empty.find('[data-testid="migration-connector-card"]').exists()).toBe(false)
    expect(empty.find('[data-testid="source-package"]').exists()).toBe(true)
    clearNuxtData()
    state.listFails = true
    const failed = await mountSource()
    await vi.waitFor(() => expect(failed.find('[data-testid="migration-connectors-error"]').exists()).toBe(true))
    expect(failed.find('[data-testid="source-package"]').exists()).toBe(true)
  })

  it('says nothing about beta for a stable connector', async () => {
    state.connectors = [connector({ maturity: 'stable' })]
    const wrapper = await mountSource()
    await vi.waitFor(() => expect(wrapper.find('[data-connector="acme"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="connector-beta"]').exists()).toBe(false)
  })
})

describe('connector credentials form', () => {
  it('draws the fields: secrets as passwords the browser does not remember, help and how-to link', async () => {
    const wrapper = await mountForm()
    const key = wrapper.find('input[name="apiKey"]')
    expect(key.attributes()).toMatchObject({ type: 'password', autocomplete: 'new-password', spellcheck: 'false' })
    expect(wrapper.find('input[name="subdomain"]').attributes()).toMatchObject({ type: 'text', autocomplete: 'off', placeholder: 'yourcompany' })
    expect(wrapper.text()).toContain('Chiave API')
    expect(wrapper.text()).toContain('Una chiave di sola lettura di un amministratore.')
    expect(wrapper.find('[data-testid="connector-how-to"]').attributes()).toMatchObject({ href: 'https://docs.acme.example/keys', target: '_blank', rel: 'noopener noreferrer' })
    expect(wrapper.find('[data-testid="migration-beta"]').text()).toContain('Acme ATS')
  })

  it('asks for every field before sending anything', async () => {
    const wrapper = await mountForm()
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.findAll('[role="alert"]').length).toBe(2))
    expect(state.bodies).toEqual([])
  })

  it('sends the credentials once, clears them and hands over the migration', async () => {
    const wrapper = await mountForm()
    await fill(wrapper)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('started')).toEqual([['m42']]))
    expect(state.bodies).toEqual([{ connectorId: 'acme', credentials: { subdomain: 'acme', apiKey: SECRET } }])
    expect((wrapper.find('input[name="apiKey"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.html()).not.toContain(SECRET)
  })

  it('on a refusal names the field, never its value, and clears what was typed', async () => {
    state.startFails = true
    const wrapper = await mountForm()
    await fill(wrapper)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="connector-refused-fields"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="connector-refused-fields"]').text()).toContain('Chiave API')
    expect(wrapper.find('[data-testid="connector-cleared"]').exists()).toBe(true)
    expect((wrapper.find('input[name="apiKey"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('input[name="subdomain"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.html()).not.toContain(SECRET)
    expect(wrapper.emitted('started')).toBeUndefined()
  })

  it('goes back to the source choice', async () => {
    const wrapper = await mountForm()
    await wrapper.findAll('button').find((button) => button.text() === 'Indietro')?.trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
  })
})
