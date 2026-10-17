import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { instanceEmail, smtpReady } from '~~/test/fixtures/instance-email-fixtures'
import FirstSteps from './FirstSteps.vue'

const state = vi.hoisted(() => ({ value: null as unknown }))
registerEndpoint('/api/v1/instance/email-settings', { method: 'GET', handler: () => ok(state.value) })

const mounted: { unmount: () => void }[] = []
const mountSteps = async () => {
  const wrapper = await mountSuspended(FirstSteps, { props: { careersPath: '/careers/acme', canCreate: true, canInvite: true } })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  clearNuxtData('instance-email-settings')
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('FirstSteps', () => {
  it('starts with setting up email, before the job, publishing and the team', async () => {
    state.value = instanceEmail()
    const wrapper = await mountSteps()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="step-email"]').exists()).toBe(true))
    expect(wrapper.findAll('li').map((item) => item.attributes('data-testid'))).toEqual(['step-email', 'step-job', 'step-publish', 'step-team'])
    expect(wrapper.find('[data-testid="step-email"] a').attributes('href')).toBe('/app/settings/email')
    expect(wrapper.find('[data-testid="step-email-done"]').exists()).toBe(false)
  })

  it('marks the email step done once email works', async () => {
    state.value = smtpReady()
    const wrapper = await mountSteps()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="step-email-done"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="step-email"] a').exists()).toBe(false)
  })
})
