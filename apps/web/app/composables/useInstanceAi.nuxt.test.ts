import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { aiReady, instanceAi } from '~~/test/fixtures/instance-ai-fixtures'

const state = vi.hoisted(() => ({ value: null as unknown, gets: 0, put: null as unknown }))
registerEndpoint('/api/v1/instance/ai-settings', {
  method: 'GET',
  handler: () => {
    state.gets += 1
    return ok(state.value)
  },
})
registerEndpoint('/api/v1/instance/ai-settings', { method: 'PUT', handler: () => state.put })

const INPUT = { provider: 'anthropic' as const, apiKey: 'a-key-for-tests', assistantModel: 'claude-sonnet-5-5', fastModel: 'claude-haiku-5-5' }
const TEST_FAILED = { success: false, data: null, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'test', message: 'ai_test_failed' }, { path: 'test.detail', message: 'model not found' }] } }

const probe = async () => {
  let status!: ReturnType<typeof useInstanceAiStatus>
  let panel!: ReturnType<typeof useInstanceAi>
  await mountSuspended(
    defineComponent({
      setup() {
        status = useInstanceAiStatus()
        panel = useInstanceAi()
        return () => h('div')
      },
    }),
  )
  await flushPromises()
  return { status, panel }
}

beforeEach(() => {
  state.value = instanceAi()
  state.gets = 0
  clearNuxtData('instance-ai-settings')
  useAssistantConfigured().value = false
  useViewer().viewer.value = viewerWith('owner')
})

describe('useInstanceAi', () => {
  it('loads the settings once for every user of the status', async () => {
    const { status, panel } = await probe()
    await vi.waitFor(() => expect(status.settings.value?.source).toBe('none'))
    expect(panel.settings.value?.canManage).toBe(true)
    expect(state.gets).toBe(1)
  })

  it('saves, shares the new state and tells the assistant panel it is on', async () => {
    state.put = ok(aiReady())
    const { status, panel } = await probe()
    expect(await panel.save(INPUT)).toBe(true)
    expect(status.settings.value?.assistantEnabled).toBe(true)
    expect(panel.saved.value).toBe(true)
    expect(panel.errorKey.value).toBeNull()
    expect(useAssistantConfigured().value).toBe(true)
  })

  it('says the test failed with the provider detail and keeps the old state', async () => {
    state.put = TEST_FAILED
    const { status, panel } = await probe()
    expect(await panel.save(INPUT)).toBe(false)
    expect(panel.errorKey.value).toBe('instanceAi.errors.testFailed')
    expect(panel.testFailed.value).toBe(true)
    expect(panel.testDetail.value).toBe('model not found')
    expect(panel.saved.value).toBe(false)
    expect(status.settings.value?.assistantEnabled).toBe(false)
    expect(useAssistantConfigured().value).toBe(false)
  })

  it('reports a load failure without a status', async () => {
    state.value = { broken: true }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { status } = await probe()
    await vi.waitFor(() => expect(status.errorKey.value).toBe('errors.generic'))
    expect(status.settings.value).toBeNull()
  })
})
