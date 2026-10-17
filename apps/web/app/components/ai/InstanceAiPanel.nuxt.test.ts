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

  it('proposes the recommended models, one key field per provider in use, and tests before saving', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="instance-ai-keys"]').exists()).toBe(false)
    await wrapper.find('[data-testid="ai-assistant-switch"]').setValue(true)
    expect((wrapper.find('[data-testid="ai-assistant-provider"]').element as HTMLSelectElement).value).toBe('openai')
    expect((wrapper.find('[data-testid="ai-assistant-model"]').element as HTMLInputElement).value).toBe('gpt-6-luna')
    expect(wrapper.findAll('#ai-assistant-model-suggestions option').map((option) => option.attributes('value'))[0]).toBe('gpt-6-luna')
    expect(wrapper.find('[data-testid="ai-assistant-recommended"]').text()).toContain('non da un benchmark')
    expect(wrapper.find('[data-testid="instance-ai-save"]').text()).toBe('Salva e prova i modelli')
    expect(wrapper.findAll('[data-testid^="ai-key-"][type="password"]').map((field) => field.attributes('data-testid'))).toEqual(['ai-key-openai'])
    const openai = wrapper.find('[data-testid="ai-key-openai"]')
    expect(openai.attributes('autocomplete')).toBe('off')
    expect(openai.attributes('placeholder')).toBeUndefined()
    expect(wrapper.find('[data-testid="ai-key-link-openai"]').attributes('href')).toBe('https://platform.openai.com/api-keys')

    await wrapper.find('[data-testid="ai-fast-switch"]').setValue(true)
    expect((wrapper.find('[data-testid="ai-fast-provider"]').element as HTMLSelectElement).value).toBe('google')
    expect((wrapper.find('[data-testid="ai-fast-model"]').element as HTMLInputElement).value).toBe('gemini-3.1-flash-lite')
    expect(wrapper.find('[data-testid="ai-key-link-google"]').attributes('href')).toBe('https://aistudio.google.com/app/apikey')

    await wrapper.find('[data-testid="instance-ai-form"]').trigger('submit')
    expect(wrapper.findAll('[role="alert"]').map((alert) => alert.text())).toEqual(['Inserisci la chiave API del fornitore', 'Inserisci la chiave API del fornitore'])
    expect(state.puts).toEqual([])

    await wrapper.find('[data-testid="ai-key-google"]').setValue('a-google-key')
    await wrapper.find('[data-testid="ai-fast-provider"]').setValue('openai')
    expect(wrapper.find('[data-testid="ai-key-google"]').exists()).toBe(false)
    expect((wrapper.find('[data-testid="ai-fast-model"]').element as HTMLInputElement).value).toBe('gpt-5-mini')
    await wrapper.find('[data-testid="ai-key-openai"]').setValue('an-openai-key')
    await wrapper.find('[data-testid="instance-ai-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="ai-saved"]').exists()).toBe(true))
    expect(state.puts).toEqual([{ assistant: { provider: 'openai', model: 'gpt-6-luna' }, fast: { provider: 'openai', model: 'gpt-5-mini' }, keys: { openai: 'an-openai-key' } }])
    expect(wrapper.find('[data-testid="instance-ai-assistant-state"]').text()).toBe('Assistente attivo')
    expect((wrapper.find('[data-testid="ai-key-openai"]').element as HTMLInputElement).value).toBe('')
  })

  it('shows a refused test with the provider words as text and what to check, keeping stored keys', async () => {
    state.value = aiReady()
    state.answer = TEST_FAILED
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="ai-key-anthropic"]').attributes('placeholder')).toBe('salvata, lascia vuoto per mantenerla')
    expect(wrapper.find('[data-testid="ai-key-google"]').attributes('placeholder')).toBe('salvata, lascia vuoto per mantenerla')
    await wrapper.find('[data-testid="ai-fast-model"]').setValue('gemini-tiny')
    await wrapper.find('[data-testid="instance-ai-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="ai-test-detail"]').exists()).toBe(true))
    expect(state.puts).toEqual([{ assistant: { provider: 'anthropic', model: 'claude-sonnet-5-5' }, fast: { provider: 'google', model: 'gemini-tiny' }, keys: {} }])
    expect(wrapper.find('[data-testid="ai-test-detail"]').text()).toBe('<b>model not found</b>')
    expect(wrapper.find('[data-testid="ai-test-detail"] b').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ai-test-hint"]').text()).toContain('credito')
    expect(wrapper.text()).toContain('nulla è stato salvato')
  })

  it('shows a key the server misses on the field of its provider', async () => {
    state.value = aiReady({ storedKeys: ['anthropic', 'google'] })
    state.answer = { success: false, data: null, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'keys.google', message: 'required' }] } }
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="instance-ai-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('#ai-key-google-error').exists()).toBe(true))
    expect(wrapper.find('#ai-key-google-error').text()).toBe('Inserisci la chiave API del fornitore')
    expect(wrapper.find('#ai-key-anthropic-error').exists()).toBe(false)
  })

  it('turns AI off with a plain save', async () => {
    state.value = aiReady()
    state.answer = ok(aiReady({ assistant: null, fast: null, assistantEnabled: false, fastEnabled: false }))
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="ai-assistant-switch"]').setValue(false)
    await wrapper.find('[data-testid="ai-fast-switch"]').setValue(false)
    expect(wrapper.find('[data-testid="instance-ai-save"]').text()).toBe('Salva')
    expect(wrapper.find('[data-testid="instance-ai-keys"]').exists()).toBe(false)
    await wrapper.find('[data-testid="instance-ai-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="ai-saved"]').exists()).toBe(true))
    expect(state.puts).toEqual([{ assistant: null, fast: null, keys: {} }])
    expect(wrapper.find('[data-testid="ai-saved"]').text()).toContain('spenta')
  })

  it('shows a server configuration read-only, without a form', async () => {
    state.value = instanceAi({ source: 'environment', canManage: false, assistant: { provider: 'mistral', model: 'mistral-large-latest' }, fast: { provider: 'ollama', model: 'llama3' }, assistantEnabled: true })
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="instance-ai-source"]').text()).toBe('Impostato sul server')
    expect(wrapper.find('[data-testid="instance-ai-assistant-state"]').text()).toBe('Assistente attivo')
    expect(wrapper.find('[data-testid="instance-ai-form"]').exists()).toBe(false)
    const summary = wrapper.find('[data-testid="instance-ai-summary"]').text()
    expect(summary).toContain('Mistral')
    expect(summary).toContain('mistral-large-latest')
    expect(summary).toContain('ollama')
    expect(summary).toContain('llama3')
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
