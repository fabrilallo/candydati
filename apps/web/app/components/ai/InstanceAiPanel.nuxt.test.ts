import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { aiReady, instanceAi } from '~~/test/fixtures/instance-ai-fixtures'
import InstanceAiPanel from './InstanceAiPanel.vue'

const state = vi.hoisted(() => ({ value: null as unknown, puts: [] as unknown[], answer: null as unknown }))
registerEndpoint('/api/v1/instance/ai-settings', { method: 'GET', handler: () => ok(state.value) })
registerEndpoint('/api/v1/instance/ai-settings', {
  method: 'PUT',
  handler: async (event) => {
    state.puts.push(await readBody(event))
    return state.answer
  },
})

const TEST_FAILED = {
  success: false,
  data: null,
  error: { code: 'validation_failed', message: 'x', issues: [{ path: 'test', message: 'ai_test_failed' }, { path: 'test.detail', message: '<b>model not found</b>' }] },
}
const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  const wrapper = await mountSuspended(InstanceAiPanel, { attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="instance-ai-assistant-state"]').exists()).toBe(true))
  return wrapper
}

beforeEach(() => {
  state.value = instanceAi()
  state.puts.length = 0
  state.answer = ok(aiReady())
  clearNuxtData('instance-ai-settings')
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('InstanceAiPanel', () => {
  it('says both models are off and explains each, the privacy duty and the costs', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="instance-ai-assistant-state"]').text()).toBe('Assistente spento')
    expect(wrapper.find('[data-testid="instance-ai-fast-state"]').text()).toBe('Modello rapido spento')
    expect(wrapper.find('[data-testid="ai-assistant-block"]').text()).toContain('non ordina, non valuta e non scarta')
    expect(wrapper.find('[data-testid="ai-fast-block"]').text()).toContain('solo le regole')
    expect(wrapper.find('[data-testid="instance-ai-privacy"]').text()).toContain('sub-responsabile')
    expect(wrapper.find('[data-testid="instance-ai-costs"] a').attributes('href')).toBe('https://fabrilallo.github.io/candydati/guide/ai')
    expect(wrapper.find('[data-testid="ai-assistant-model"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="instance-ai-save"]').text()).toBe('Salva')
  })

  it('suggests models of the provider, links to its keys and tests before saving', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="ai-provider"]').setValue('anthropic')
    expect(wrapper.find('[data-testid="ai-key-link"]').attributes('href')).toBe('https://console.anthropic.com/settings/keys')
    const key = wrapper.find('[data-testid="ai-api-key"]')
    expect(key.attributes('type')).toBe('password')
    expect(key.attributes('autocomplete')).toBe('off')
    await wrapper.find('[data-testid="ai-assistant-switch"]').setValue(true)
    expect((wrapper.find('[data-testid="ai-assistant-model"]').element as HTMLInputElement).value).toBe('claude-sonnet-5-5')
    expect(wrapper.findAll('#ai-assistant-model-suggestions option').map((option) => option.attributes('value'))).toContain('claude-sonnet-5-5')
    expect(wrapper.find('[data-testid="instance-ai-save"]').text()).toBe('Salva e prova i modelli')

    await wrapper.find('[data-testid="instance-ai-form"]').trigger('submit')
    expect(wrapper.text()).toContain('Inserisci la chiave API')
    expect(state.puts).toEqual([])

    await key.setValue('a-key-for-tests')
    await wrapper.find('[data-testid="ai-fast-switch"]').setValue(true)
    await wrapper.find('[data-testid="instance-ai-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="ai-saved"]').exists()).toBe(true))
    expect(state.puts).toEqual([{ provider: 'anthropic', apiKey: 'a-key-for-tests', assistantModel: 'claude-sonnet-5-5', fastModel: 'claude-haiku-5-5' }])
    expect(wrapper.find('[data-testid="instance-ai-assistant-state"]').text()).toBe('Assistente attivo')
    expect((wrapper.find('[data-testid="ai-api-key"]').element as HTMLInputElement).value).toBe('')
  })

  it('shows a refused test with the provider words as text and what to check, keeping a stored key', async () => {
    state.value = aiReady()
    state.answer = TEST_FAILED
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="ai-api-key"]').attributes('placeholder')).toBe('salvata, lascia vuoto per mantenerla')
    await wrapper.find('[data-testid="ai-fast-model"]').setValue('claude-tiny')
    await wrapper.find('[data-testid="instance-ai-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="ai-test-detail"]').exists()).toBe(true))
    expect(state.puts).toEqual([{ provider: 'anthropic', assistantModel: 'claude-sonnet-5-5', fastModel: 'claude-tiny' }])
    expect(wrapper.find('[data-testid="ai-test-detail"]').text()).toBe('<b>model not found</b>')
    expect(wrapper.find('[data-testid="ai-test-detail"] b').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ai-test-hint"]').text()).toContain('credito')
    expect(wrapper.text()).toContain('nulla è stato salvato')
  })

  it('turns AI off with a plain save', async () => {
    state.value = aiReady()
    state.answer = ok(aiReady({ assistantModel: null, fastModel: null, assistantEnabled: false, fastEnabled: false }))
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="ai-assistant-switch"]').setValue(false)
    await wrapper.find('[data-testid="ai-fast-switch"]').setValue(false)
    expect(wrapper.find('[data-testid="instance-ai-save"]').text()).toBe('Salva')
    await wrapper.find('[data-testid="instance-ai-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="ai-saved"]').exists()).toBe(true))
    expect(state.puts).toEqual([{ provider: 'anthropic', assistantModel: null, fastModel: null }])
    expect(wrapper.find('[data-testid="ai-saved"]').text()).toContain('spenta')
  })

  it('shows a server configuration read-only, without a form', async () => {
    state.value = instanceAi({ source: 'environment', canManage: false, provider: 'mistral', assistantModel: 'mistral/mistral-large-latest', fastModel: null, assistantEnabled: true, hasApiKey: true })
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="instance-ai-source"]').text()).toBe('Impostato sul server')
    expect(wrapper.find('[data-testid="instance-ai-assistant-state"]').text()).toBe('Assistente attivo')
    expect(wrapper.find('[data-testid="instance-ai-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="instance-ai-summary"]').text()).toContain('mistral/mistral-large-latest')
  })

  it('tells a member who cannot change it to ask the administrator', async () => {
    state.value = instanceAi({ canManage: false })
    useViewer().viewer.value = viewerWith('recruiter')
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="instance-ai-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="instance-ai-ask-admin"]').exists()).toBe(true)
  })

  it('offers a retry when the settings cannot be loaded', async () => {
    state.value = { broken: true }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const wrapper = await mountSuspended(InstanceAiPanel)
    mounted.push(wrapper)
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    state.value = instanceAi()
    await wrapper.find('[data-testid="instance-ai-retry"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="instance-ai-assistant-state"]').exists()).toBe(true))
  })
})
