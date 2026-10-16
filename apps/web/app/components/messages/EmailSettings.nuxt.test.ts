import type { EmailSettingsDto } from '@candydati/domain'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { settings } from '~~/test/fixtures/message-fixtures'
import EmailSettingsPanel from './EmailSettingsPanel.vue'

const RECORDS = [
  { type: 'TXT', name: 'resend._domainkey.acme.test', value: 'p=MIGfMA0GCSqGSIb3DQEB' },
  { type: 'MX', name: 'send.acme.test', value: 'feedback-smtp.eu-west-1.amazonses.com' },
]
const state = vi.hoisted(() => ({ value: null as unknown, puts: [] as unknown[], verifies: 0, afterVerify: null as unknown }))
registerEndpoint('/api/v1/email-settings', { method: 'GET', handler: () => ok(state.value) })
registerEndpoint('/api/v1/email-settings', {
  method: 'PUT',
  handler: async (event) => {
    const body = await readBody<{ senderName: string; fromAddress: string | null }>(event)
    state.puts.push(body)
    return ok({ ...(state.value as EmailSettingsDto), ...body, domain: body.fromAddress ? { name: 'acme.test', status: 'pending', records: RECORDS } : null })
  },
})
registerEndpoint('/api/v1/email-settings/verify', {
  method: 'POST',
  handler: () => {
    state.verifies += 1
    return ok(state.afterVerify)
  },
})

const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  const wrapper = await mountSuspended(EmailSettingsPanel, { attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="email-effective"]').exists()).toBe(true))
  return wrapper
}

beforeEach(() => {
  state.value = settings()
  state.puts.length = 0
  state.verifies = 0
  clearNuxtData('email-settings')
  useViewer().viewer.value = viewerWith('admin')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('EmailSettingsPanel', () => {
  it('shows the effective sender and that replies always come back here', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="effective-from"]').text()).toBe('"Acme via Piattaforma" <noreply@mail.example.org>')
    expect(wrapper.find('[data-testid="replies-line"]').text()).toContain('Le risposte tornano sempre qui')
    expect(wrapper.find('[data-testid="email-domain"]').exists()).toBe(false)
  })

  it('validates and saves the sender, then shows the records to publish for a pending domain', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="from-address"]').setValue('jobs')
    await wrapper.find('[data-testid="email-settings-form"]').trigger('submit')
    expect(wrapper.text()).toContain('Scrivi un indirizzo email valido')
    expect(state.puts).toEqual([])
    await wrapper.find('[data-testid="from-address"]').setValue(' Jobs@Acme.test ')
    await wrapper.find('[data-testid="email-settings-form"]').trigger('submit')
    await vi.waitFor(() => expect(state.puts).toEqual([{ senderName: 'Acme Recruiting', fromAddress: 'jobs@acme.test' }]))
    await flushPromises()
    expect(wrapper.find('[data-testid="domain-status"]').text()).toBe('In attesa')
    expect(wrapper.findAll('[data-testid="dns-record"]').map((row) => row.text())).toEqual([expect.stringContaining('resend._domainkey.acme.test'), expect.stringContaining('feedback-smtp')])
  })

  it('copies a DNS value and checks the domain again', async () => {
    state.value = settings({ fromAddress: 'jobs@acme.test', domain: { name: 'acme.test', status: 'failed', records: RECORDS } })
    state.afterVerify = settings({ fromAddress: 'jobs@acme.test', domain: { name: 'acme.test', status: 'verified', records: RECORDS }, effectiveFrom: 'Acme <jobs@acme.test>' })
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="domain-status"]').text()).toBe('Non riuscito')
    await wrapper.find('[data-testid="copy-value-0"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith('p=MIGfMA0GCSqGSIb3DQEB')
    await wrapper.find('[data-testid="domain-verify"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="domain-status"]').text()).toBe('Verificato'))
    expect(state.verifies).toBe(1)
    expect(wrapper.find('[data-testid="effective-from"]').text()).toBe('Acme <jobs@acme.test>')
    expect(wrapper.find('[data-testid="dns-records"]').exists()).toBe(false)
  })

  it('says the instance manages the sender with SMTP, without a verify button', async () => {
    state.value = settings({ fromAddress: 'jobs@acme.test', domain: { name: 'acme.test', status: 'unsupported', records: [] } })
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="domain-status"]').text()).toBe("Gestito dall'istanza")
    expect(wrapper.find('[data-testid="domain-verify"]').exists()).toBe(false)
  })
})
