import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { instanceEmail, smtpReady } from '~~/test/fixtures/instance-email-fixtures'

const state = vi.hoisted(() => ({ value: null as unknown, gets: 0, put: null as unknown }))
registerEndpoint('/api/v1/instance/email-settings', {
  method: 'GET',
  handler: () => {
    state.gets += 1
    return ok(state.value)
  },
})
registerEndpoint('/api/v1/instance/email-settings', { method: 'PUT', handler: () => state.put })

const INPUT = { provider: 'smtp' as const, smtp: { host: 'smtp.example.org', port: 587, secure: false }, sendingDomain: 'acme.test', fromLocal: 'jobs' }

const probe = async () => {
  let status!: ReturnType<typeof useInstanceEmailStatus>
  let panel!: ReturnType<typeof useInstanceEmail>
  await mountSuspended(
    defineComponent({
      setup() {
        status = useInstanceEmailStatus()
        panel = useInstanceEmail()
        return () => h('div')
      },
    }),
  )
  await flushPromises()
  return { status, panel }
}

beforeEach(() => {
  state.value = instanceEmail()
  state.gets = 0
  clearNuxtData('instance-email-settings')
  useViewer().viewer.value = viewerWith('owner')
})

describe('useInstanceEmail', () => {
  it('loads the settings once for every user of the status', async () => {
    const { status, panel } = await probe()
    await vi.waitFor(() => expect(status.settings.value?.source).toBe('none'))
    expect(status.ready.value).toBe(false)
    expect(panel.settings.value?.canManage).toBe(true)
    expect(state.gets).toBe(1)
  })

  it('saves, sends the test to the admin and shares the new state', async () => {
    state.put = ok(smtpReady())
    const { status, panel } = await probe()
    expect(await panel.save(INPUT)).toBe(true)
    expect(status.ready.value).toBe(true)
    expect(panel.sentTo.value).toBe('ada@example.com')
    expect(panel.errorKey.value).toBeNull()
  })

  it('says the test failed and keeps the old state', async () => {
    state.put = { success: false, data: null, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'test', message: 'email_test_failed' }] } }
    const { status, panel } = await probe()
    expect(await panel.save(INPUT)).toBe(false)
    expect(panel.errorKey.value).toBe('instanceEmail.errors.testFailed')
    expect(panel.testFailed.value).toBe(true)
    expect(panel.sentTo.value).toBeNull()
    expect(status.ready.value).toBe(false)
  })

  it('reports a load failure without a status', async () => {
    state.value = { broken: true }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { status } = await probe()
    await vi.waitFor(() => expect(status.errorKey.value).toBe('errors.generic'))
    expect(status.ready.value).toBeNull()
  })
})
