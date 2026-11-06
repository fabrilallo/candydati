import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import SourcingSetting from './SourcingSetting.vue'

const state = vi.hoisted(() => ({ value: false, puts: [] as unknown[] }))
registerEndpoint('/api/v1/settings/sourcing', async (event) => {
  if (event.method === 'PUT') {
    const body = await readBody<{ noticeByEmail: boolean }>(event)
    state.puts.push(body)
    state.value = body.noticeByEmail
  }
  return ok({ noticeByEmail: state.value })
})

describe('sourcing setting', () => {
  it('is off by default, says the notice goes with the first message, and turns the email on', async () => {
    const wrapper = await mountSuspended(SourcingSetting)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="sourcing-email-toggle"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="sourcing-email-explain"]').text()).toContain('con il primo messaggio')
    await wrapper.find('[data-testid="sourcing-email-toggle"]').setValue(true)
    await vi.waitFor(() => expect(state.puts).toEqual([{ noticeByEmail: true }]))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="sourcing-email-explain"]').text()).toContain('appena viene aggiunto'))
  })
})
