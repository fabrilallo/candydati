import type { SetupProgressDto } from '@candydati/domain'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { instanceEmail, smtpReady } from '~~/test/fixtures/instance-email-fixtures'
import FirstSteps from './FirstSteps.vue'

const NOTHING: SetupProgressDto = { privacyNotice: false, careersPage: false, jobCreated: false, jobPublished: false, team: false }
const EVERYTHING: SetupProgressDto = { privacyNotice: true, careersPage: true, jobCreated: true, jobPublished: true, team: true }
const state = vi.hoisted(() => ({ email: null as unknown, progress: null as unknown }))
registerEndpoint('/api/v1/instance/email-settings', { method: 'GET', handler: () => ok(state.email) })
registerEndpoint('/api/v1/setup-progress', { method: 'GET', handler: () => ok(state.progress) })

const mounted: { unmount: () => void }[] = []
const mountSteps = async () => {
  const wrapper = await mountSuspended(FirstSteps)
  mounted.push(wrapper)
  return wrapper
}
const stepIds = (wrapper: Awaited<ReturnType<typeof mountSteps>>) => wrapper.findAll('li').map((item) => item.attributes('data-testid'))

beforeEach(() => {
  clearNuxtData('instance-email-settings')
  clearNuxtData('setup-progress')
  useViewer().viewer.value = viewerWith('owner')
  state.email = instanceEmail()
  state.progress = NOTHING
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('FirstSteps', () => {
  it('lists every setup step in the order they are needed, the privacy notice before the first job', async () => {
    const wrapper = await mountSteps()
    await vi.waitFor(() => expect(stepIds(wrapper)).toHaveLength(6))
    expect(stepIds(wrapper)).toEqual(['step-email', 'step-privacy', 'step-careers', 'step-job', 'step-publish', 'step-team'])
    expect(wrapper.find('[data-testid="step-privacy"] a').attributes('href')).toBe('/app/settings/privacy')
    expect(wrapper.find('[data-testid="step-careers"] a').attributes('href')).toBe('/app/settings/careers')
  })

  it('ticks each step from the real state', async () => {
    state.email = smtpReady()
    state.progress = { ...NOTHING, privacyNotice: true, jobCreated: true }
    const wrapper = await mountSteps()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="step-privacy-done"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="step-email-done"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="step-job-done"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="step-careers-done"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="step-publish"] a').attributes('href')).toBe('/app/jobs')
  })

  it('shows a role only the steps it can take', async () => {
    useViewer().viewer.value = viewerWith('recruiter')
    const wrapper = await mountSteps()
    await vi.waitFor(() => expect(stepIds(wrapper).length).toBeGreaterThan(0))
    expect(stepIds(wrapper)).not.toContain('step-privacy')
    expect(stepIds(wrapper)).not.toContain('step-team')
    expect(stepIds(wrapper)).toContain('step-job')
  })

  it('goes away once everything is done', async () => {
    state.email = smtpReady()
    state.progress = EVERYTHING
    const wrapper = await mountSteps()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(wrapper.find('[data-testid="first-steps"]').exists()).toBe(false)
  })
})
