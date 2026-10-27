import { readBody, setResponseStatus } from 'h3'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aiReady, instanceAi } from '~~/test/fixtures/instance-ai-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { emptyForm } from '@/lib/job-form'
import ResponsibilitySuggestions from './ResponsibilitySuggestions.vue'

const state = vi.hoisted(() => ({ settings: null as unknown, suggest: null as unknown, bodies: [] as unknown[], status: 200 }))
registerEndpoint('/api/v1/instance/ai-settings', { method: 'GET', handler: () => ok(state.settings) })
registerEndpoint('/api/v1/jobs/responsibilities/suggest', {
  method: 'POST',
  handler: async (event) => {
    state.bodies.push(await readBody(event))
    setResponseStatus(event, state.status)
    return state.suggest
  },
})

const form = { ...emptyForm(), title: 'Backend Developer', role: 'backend_developer', responsibilities: ['Scrive codice'] }
const mountIt = async (props: Record<string, unknown> = {}) => {
  const wrapper = await mountSuspended(ResponsibilitySuggestions, { props: { id: 'job-field-responsibilities', form, disabled: false, ...props } })
  await new Promise((resolve) => setTimeout(resolve, 50))
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  state.settings = aiReady()
  state.suggest = ok({ status: 'proposed', responsibilities: ['Progetta le API', 'Rivede il codice'] })
  state.bodies = []
  state.status = 200
  clearNuxtData('instance-ai-settings')
  useViewer().viewer.value = viewerWith('owner')
})

describe('ResponsibilitySuggestions', () => {
  it('is hidden when the instance has no fast model or the form is read only', async () => {
    state.settings = instanceAi()
    expect((await mountIt()).find('[data-testid="responsibility-suggestions"]').exists()).toBe(false)
    state.settings = aiReady()
    clearNuxtData('instance-ai-settings')
    expect((await mountIt({ disabled: true })).find('[data-testid="responsibility-suggestions"]').exists()).toBe(false)
  })

  it('is disabled with a hint until a title or a role is set', async () => {
    const wrapper = await mountIt({ form: emptyForm() })
    const button = wrapper.find('[data-testid="suggest-responsibilities"]')
    expect(button.text()).toBe('Suggerisci responsabilità')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-describedby')).toBe('job-field-responsibilities-suggest-hint')
    expect(wrapper.text()).toContain('Indica prima il titolo o il ruolo')
  })

  it('asks with the ad context, lists proposals and adds one or all without sending the form back', async () => {
    const wrapper = await mountIt()
    await wrapper.find('[data-testid="suggest-responsibilities"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="suggestion"]')).toHaveLength(2))
    expect(state.bodies[0]).toMatchObject({ title: 'Backend Developer', role: 'backend_developer', language: 'it', existing: ['Scrive codice'] })
    await wrapper.find('[data-testid="suggestion-add"]').trigger('click')
    expect(wrapper.emitted('add')?.[0]).toEqual([['Progetta le API']])
    expect(wrapper.findAll('[data-testid="suggestion"]')).toHaveLength(1)
    await wrapper.find('[data-testid="suggest-add-all"]').trigger('click')
    expect(wrapper.emitted('add')?.[1]).toEqual([['Rivede il codice']])
    expect(wrapper.find('[data-testid="suggest-list"]').exists()).toBe(false)
  })

  it('can dismiss the proposals', async () => {
    const wrapper = await mountIt()
    await wrapper.find('[data-testid="suggest-responsibilities"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="suggest-list"]').exists()).toBe(true))
    await wrapper.find('[data-testid="suggest-dismiss"]').trigger('click')
    expect(wrapper.find('[data-testid="suggest-list"]').exists()).toBe(false)
  })

  it('says so when the model failed, and when the request fails', async () => {
    state.suggest = ok({ status: 'failed' })
    const wrapper = await mountIt()
    await wrapper.find('[data-testid="suggest-responsibilities"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="suggest-message"]').text()).toContain('Non siamo riusciti'))
    state.status = 500
    state.suggest = { success: false, data: null, error: { code: 'internal', message: 'x' } }
    await wrapper.find('[data-testid="suggest-responsibilities"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="suggest-message"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="suggest-list"]').exists()).toBe(false)
  })
})
