import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { instanceEmail, smtpReady } from '~~/test/fixtures/instance-email-fixtures'
import InstanceEmailPanel from './InstanceEmailPanel.vue'

const state = vi.hoisted(() => ({ value: null as unknown, puts: [] as unknown[], answer: null as unknown }))
registerEndpoint('/api/v1/instance/email-settings', { method: 'GET', handler: () => ok(state.value) })
registerEndpoint('/api/v1/instance/email-settings', {
  method: 'PUT',
  handler: async (event) => {
    state.puts.push(await readBody(event))
    return state.answer
  },
})

const TEST_FAILED = { success: false, data: null, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'test', message: 'email_test_failed' }] } }
const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  const wrapper = await mountSuspended(InstanceEmailPanel, { attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="instance-email-state"]').exists()).toBe(true))
  return wrapper
}

beforeEach(() => {
  state.value = instanceEmail()
  state.puts.length = 0
  state.answer = ok(smtpReady())
  clearNuxtData('instance-email-settings')
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('InstanceEmailPanel', () => {
  it('says email is not configured and offers SMTP on 587 with a From preview', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="instance-email-state"]').text()).toBe('Non configurata')
    expect((wrapper.find('[data-testid="smtp-port"]').element as HTMLInputElement).value).toBe('587')
    expect(wrapper.find('[data-testid="from-preview"]').exists()).toBe(false)
    await wrapper.find('[data-testid="sending-domain"]').setValue('Acme.test')
    expect(wrapper.find('[data-testid="from-preview"]').text()).toBe('noreply@acme.test')
    await wrapper.find('[data-testid="from-local"]').setValue('jobs')
    expect(wrapper.find('[data-testid="from-preview"]').text()).toBe('jobs@acme.test')
  })

  it('turns TLS from the first byte on for 465 and keeps passwords hidden', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="smtp-port"]').setValue('465')
    expect((wrapper.find('[data-testid="smtp-secure"]').element as HTMLInputElement).checked).toBe(true)
    const password = wrapper.find('[data-testid="smtp-password"]')
    expect(password.attributes('type')).toBe('password')
    expect(password.attributes('autocomplete')).toBe('off')
  })

  it('validates, saves with a test email and says where it went', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="instance-email-form"]').trigger('submit')
    expect(wrapper.text()).toContain("Scrivi l'indirizzo del server SMTP")
    expect(state.puts).toEqual([])
    await wrapper.find('[data-testid="smtp-host"]').setValue('smtp.example.org')
    await wrapper.find('[data-testid="smtp-password"]').setValue('secret')
    await wrapper.find('[data-testid="sending-domain"]').setValue('acme.test')
    await wrapper.find('[data-testid="instance-email-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="test-sent"]').exists()).toBe(true))
    expect(state.puts).toEqual([{ provider: 'smtp', smtp: { host: 'smtp.example.org', port: 587, secure: false, password: 'secret' }, sendingDomain: 'acme.test', fromLocal: 'noreply' }])
    expect(wrapper.find('[data-testid="test-sent"]').text()).toContain('ada@example.com')
    expect(wrapper.find('[data-testid="instance-email-state"]').text()).toBe('Funzionante')
    expect((wrapper.find('[data-testid="smtp-password"]').element as HTMLInputElement).value).toBe('')
  })

  it('shows a refused Resend test with what to check, and keeps a stored key when left empty', async () => {
    state.value = instanceEmail({ source: 'app', provider: 'resend', resend: { hasApiKey: true }, sendingDomain: 'acme.test' })
    state.answer = TEST_FAILED
    const wrapper = await mountPanel()
    const key = wrapper.find('[data-testid="resend-api-key"]')
    expect(key.attributes('placeholder')).toBe('salvata, lascia vuoto per mantenerla')
    expect(key.attributes('type')).toBe('password')
    await wrapper.find('[data-testid="instance-email-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="test-failed-hint"]').exists()).toBe(true))
    expect(state.puts).toEqual([{ provider: 'resend', resend: {}, sendingDomain: 'acme.test', fromLocal: 'noreply' }])
    expect(wrapper.text()).toContain("L'email di prova non è stata accettata")
    expect(wrapper.find('[data-testid="test-failed-hint"]').text()).toContain('verificato in Resend')
  })

  it('switches provider and points SMTP failures at the server', async () => {
    state.value = smtpReady()
    state.answer = TEST_FAILED
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="smtp-password"]').attributes('placeholder')).toBe('salvata, lascia vuoto per mantenerla')
    await wrapper.find('[data-testid="provider-resend"]').setValue(true)
    expect(wrapper.find('[data-testid="smtp-host"]').exists()).toBe(false)
    await wrapper.find('[data-testid="provider-smtp"]').setValue(true)
    await wrapper.find('[data-testid="instance-email-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="test-failed-hint"]').text()).toContain('porta'))
  })

  it('shows a server configuration read-only, without a form', async () => {
    state.value = instanceEmail({ source: 'environment', ready: true, canManage: false, provider: 'smtp', smtp: { host: 'mail.internal', port: 25, secure: false, user: '', hasPassword: false }, sendingDomain: 'acme.test' })
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="instance-email-state"]').text()).toBe('Impostata sul server')
    expect(wrapper.find('[data-testid="instance-email-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="instance-email-summary"]').text()).toContain('mail.internal')
    expect(wrapper.find('[data-testid="instance-email-summary"]').text()).toContain('noreply@acme.test')
  })

  it('tells a member who cannot manage it to ask the administrator', async () => {
    state.value = instanceEmail({ canManage: false })
    useViewer().viewer.value = viewerWith('recruiter')
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="instance-email-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="instance-email-ask-admin"]').exists()).toBe(true)
  })

  it('offers a retry when the settings cannot be loaded', async () => {
    state.value = { broken: true }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const wrapper = await mountSuspended(InstanceEmailPanel)
    mounted.push(wrapper)
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    state.value = instanceEmail()
    await wrapper.find('[data-testid="instance-email-retry"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="instance-email-state"]').exists()).toBe(true))
  })
})
