import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { instanceEmail, smtpReady } from '~~/test/fixtures/instance-email-fixtures'
import FormAlert from '../FormAlert.vue'
import InstanceEmailBanner from './InstanceEmailBanner.vue'

const state = vi.hoisted(() => ({ value: null as unknown }))
registerEndpoint('/api/v1/instance/email-settings', { method: 'GET', handler: () => ok(state.value) })

const mounted: { unmount: () => void }[] = []
const settle = async <T extends { unmount: () => void }>(wrapper: T): Promise<T> => {
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}
const mountBanner = async () => settle(await mountSuspended(InstanceEmailBanner))
const mountAlert = async (messageKey: string) => settle(await mountSuspended(FormAlert, { props: { messageKey } }))

beforeEach(() => {
  clearNuxtData('instance-email-settings')
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('InstanceEmailBanner', () => {
  it('says the instance is closed until email is configured, with a link for who can do it', async () => {
    state.value = instanceEmail()
    const wrapper = await mountBanner()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="instance-email-banner"]').exists()).toBe(true))
    expect(wrapper.text()).toContain("L'email non è configurata")
    expect(wrapper.find('a').attributes('href')).toBe('/app/settings/email')
  })

  it('has no link for who cannot configure it', async () => {
    state.value = instanceEmail({ canManage: false })
    const wrapper = await mountBanner()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="instance-email-banner"]').exists()).toBe(true))
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('stays hidden once email works', async () => {
    state.value = smtpReady()
    const wrapper = await mountBanner()
    expect(wrapper.find('[data-testid="instance-email-banner"]').exists()).toBe(false)
  })
})

describe('FormAlert', () => {
  it('links the email settings when an action was refused for missing email', async () => {
    state.value = instanceEmail()
    const wrapper = await mountAlert('errors.emailNotConfigured')
    expect(wrapper.text()).toContain("Prima configura l'email")
    await vi.waitFor(() => expect(wrapper.find('a').attributes('href')).toBe('/app/settings/email'))
  })

  it('shows any other message as it is, without a link', async () => {
    const wrapper = await mountAlert('errors.forbidden')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('a').exists()).toBe(false)
  })
})
