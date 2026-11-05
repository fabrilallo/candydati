import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import { publicNotice } from '~~/test/fixtures/candidate-fixtures'
import ApplySection from './ApplySection.vue'

type Outcome = { status: 'filled'; prefill: { firstName: string; lastName: string; email: string | null } } | { status: 'cancelled' | 'failed' | 'none' }

const state = vi.hoisted(() => ({ enabled: true, outcome: { status: 'none' } as Outcome, prefillPosts: 0, applications: 0, statusReads: 0 }))
registerEndpoint('/api/v1/public/linkedin/status', () => {
  state.statusReads += 1
  return ok({ enabled: state.enabled })
})
registerEndpoint('/api/v1/public/linkedin/prefill', {
  method: 'POST',
  handler: () => {
    state.prefillPosts += 1
    return ok(state.outcome)
  },
})
registerEndpoint('/api/v1/public/organizations/acme/jobs/backend-1/applications', {
  method: 'POST',
  handler: () => {
    state.applications += 1
    return ok({ received: true })
  },
})

const mounted: { unmount: () => void }[] = []
const mountSection = async (language = 'it') => {
  const wrapper = await mountSuspended(ApplySection, {
    props: { org: 'acme', job: 'backend-1', title: 'Backend developer', organization: 'Acme', language, responseDays: 5, notice: publicNotice() },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}
const open = async (wrapper: Awaited<ReturnType<typeof mountSection>>) => {
  await wrapper.find('[data-testid="apply-open"]').trigger('click')
  await flushPromises()
}
const valueOf = (wrapper: Awaited<ReturnType<typeof mountSection>>, selector: string) => (wrapper.find(selector).element as HTMLInputElement).value

beforeAll(async () => {
  await useNuxtApp().$i18n.loadLocaleMessages('en')
})
beforeEach(() => {
  Object.assign(state, { enabled: true, outcome: { status: 'none' }, prefillPosts: 0, applications: 0, statusReads: 0 })
  window.history.replaceState(null, '', '/careers/acme/backend-1')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('Fill in with LinkedIn', () => {
  it('offers a plain link to start, with what is read stated next to it', async () => {
    const wrapper = await mountSection()
    await open(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="linkedin-start"]').exists()).toBe(true))
    const link = wrapper.find('[data-testid="linkedin-start"]')
    expect(link.element.tagName).toBe('A')
    expect(link.attributes('href')).toBe('/api/v1/public/linkedin/start?return=%2Fcareers%2Facme%2Fbackend-1')
    expect(link.text()).toBe('Compila con LinkedIn')
    expect(link.attributes('aria-describedby')).toBe('apply-linkedin-hint')
    expect(wrapper.find('#apply-linkedin-hint').text()).toContain('La foto e il resto del profilo vengono scartati')
    expect(state.prefillPosts).toBe(0)
  })

  it('is hidden when the instance has no LinkedIn app; the CV tip stays', async () => {
    state.enabled = false
    const wrapper = await mountSection('en')
    await open(wrapper)
    await vi.waitFor(() => expect(state.statusReads).toBe(1))
    await flushPromises()
    expect(wrapper.find('[data-testid="linkedin-prefill"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="cv-linkedin-tip"]').text()).toContain('Save to PDF')
    expect(wrapper.find('[role="group"][aria-labelledby="apply-cv-label"]').attributes('aria-describedby')).toContain('apply-cv-tip')
  })

  it('back from LinkedIn: opens the form, fills it once for review and sends nothing', async () => {
    state.outcome = { status: 'filled', prefill: { firstName: 'Giulia', lastName: 'Rossi', email: 'giulia@example.com' } }
    window.history.replaceState(null, '', '/careers/acme/backend-1#apply-linkedin')
    const wrapper = await mountSection('en')
    await vi.waitFor(() => expect(valueOf(wrapper, '#apply-first-name')).toBe('Giulia'))
    expect(valueOf(wrapper, '#apply-last-name')).toBe('Rossi')
    expect(valueOf(wrapper, '#apply-email')).toBe('giulia@example.com')
    expect(valueOf(wrapper, '#apply-linkedin')).toBe('')
    expect(wrapper.find('[data-testid="linkedin-notice"]').text()).toContain('Check the fields')
    expect(wrapper.find('[data-testid="linkedin-notice"]').attributes('role')).toBe('status')
    expect(window.location.hash).toBe('#apply')
    expect(state.prefillPosts).toBe(1)
    expect(state.applications).toBe(0)
  })

  it('leaves the email to the candidate when LinkedIn did not give a verified one', async () => {
    state.outcome = { status: 'filled', prefill: { firstName: 'Giulia', lastName: 'Rossi', email: null } }
    window.history.replaceState(null, '', '/careers/acme/backend-1#apply-linkedin')
    const wrapper = await mountSection()
    await vi.waitFor(() => expect(valueOf(wrapper, '#apply-first-name')).toBe('Giulia'))
    expect(valueOf(wrapper, '#apply-email')).toBe('')
  })

  it('says gently that nothing was taken when the candidate cancelled, and when it failed', async () => {
    state.outcome = { status: 'cancelled' }
    window.history.replaceState(null, '', '/careers/acme/backend-1#apply-linkedin')
    const cancelled = await mountSection()
    await vi.waitFor(() => expect(cancelled.find('[data-testid="linkedin-notice"]').text()).toContain('Nessun problema'))
    expect(valueOf(cancelled, '#apply-first-name')).toBe('')

    state.outcome = { status: 'failed' }
    window.history.replaceState(null, '', '/careers/acme/backend-1#apply-linkedin')
    const failed = await mountSection('en')
    await vi.waitFor(() => expect(failed.find('[data-testid="linkedin-notice"]').text()).toContain('could not fill in the form'))
  })

  it('does not ask for a prefill on a normal visit', async () => {
    const wrapper = await mountSection()
    expect(wrapper.find('[data-testid="application-form"]').exists()).toBe(false)
    await open(wrapper)
    expect(state.prefillPosts).toBe(0)
    expect(wrapper.find('[data-testid="linkedin-notice"]').exists()).toBe(false)
  })
})
