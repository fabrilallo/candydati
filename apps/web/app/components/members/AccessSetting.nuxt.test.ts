import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import AccessSetting from './AccessSetting.vue'

const state = vi.hoisted(() => ({ value: false, puts: [] as unknown[] }))
registerEndpoint('/api/v1/settings/access', async (event) => {
  if (event.method === 'PUT') {
    const body = await readBody<{ restrictRecruitersToTeam: boolean }>(event)
    state.puts.push(body)
    state.value = body.restrictRecruitersToTeam
  }
  return ok({ restrictRecruitersToTeam: state.value })
})

const mounted: { unmount: () => void }[] = []
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('AccessSetting', () => {
  it('is off by default, says what that means, and saves the switch', async () => {
    clearNuxtData('access-setting')
    const wrapper = await mountSuspended(AccessSetting)
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="access-toggle"]').exists()).toBe(true))
    expect((wrapper.find('[data-testid="access-toggle"]').element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.find('[data-testid="access-explain"]').text()).toContain('vedono tutti gli annunci')
    await wrapper.find('[data-testid="access-toggle"]').setValue(true)
    await flushPromises()
    expect(state.puts).toEqual([{ restrictRecruitersToTeam: true }])
    await vi.waitFor(() => expect(wrapper.find('[data-testid="access-explain"]').text()).toContain('solo dei team'))
  })
})
