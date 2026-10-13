import type { WebhookEventType } from '@tt/domain'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { webhook } from '~~/test/fixtures/phase4-fixtures'
import WebhooksPanel from './WebhooksPanel.vue'

const state = vi.hoisted(() => ({ created: [] as unknown[], puts: [] as unknown[], tests: 0, deletes: 0 }))
registerEndpoint('/api/v1/webhooks', async (event) => {
  if (event.method !== 'POST') return ok([webhook('w1')])
  const body = await readBody<{ url: string; events: WebhookEventType[] }>(event)
  state.created.push(body)
  return ok({ ...webhook('w2', { url: body.url, events: body.events }), secret: 'whsec_once' })
})
registerEndpoint('/api/v1/webhooks/w1', async (event) => {
  if (event.method === 'DELETE') {
    state.deletes += 1
    return ok(null)
  }
  const body = await readBody<{ enabled: boolean }>(event)
  state.puts.push(body)
  return ok(webhook('w1', { enabled: body.enabled }))
})
registerEndpoint('/api/v1/webhooks/w1/test', { method: 'POST', handler: () => (state.tests += 1, ok({ queued: true })) })
registerEndpoint('/api/v1/webhooks/w1/deliveries', () =>
  ok([
    { id: 'd1', eventId: 'ev1', eventType: 'application.received', status: 'success', responseCode: 200, attempt: 1, error: null, createdAt: '2026-10-13T09:00:00.000Z' },
    { id: 'd2', eventId: 'ev2', eventType: 'ping', status: 'failed', responseCode: null, attempt: 2, error: 'timeout', createdAt: '2026-10-13T10:00:00.000Z' },
  ]),
)

const mounted: { unmount: () => void }[] = []
const byTestId = <T extends HTMLElement = HTMLElement>(testId: string) => document.body.querySelector<T>(`[data-testid="${testId}"]`)
const mountPanel = async () => {
  const wrapper = await mountSuspended(WebhooksPanel, { attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.findAll('[data-testid="webhook-item"]').length).toBe(1))
  return wrapper
}
beforeEach(() => {
  state.created.length = 0
  state.puts.length = 0
  state.tests = 0
  state.deletes = 0
  clearNuxtData()
  useViewer().viewer.value = viewerWith('admin')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('webhooks', () => {
  it('lists endpoints with their events and documents the signature header', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="webhook-item"]').text()).toContain('https://hooks.example.com/tt')
    expect(wrapper.find('[data-testid="webhook-item"]').text()).toContain('Candidatura ricevuta')
    expect(wrapper.find('[data-testid="webhook-docs"]').text()).toContain('x-tt-signature')
    expect(wrapper.find('[data-testid="webhook-docs"]').text()).toContain('x-tt-timestamp')
  })

  it('creates an endpoint and shows the secret once, with a warning, until confirmed', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="webhook-add"]').trigger('click')
    await vi.waitFor(() => expect(byTestId('webhook-url')).not.toBeNull())
    const url = byTestId<HTMLInputElement>('webhook-url')
    if (!url) throw new Error('no url field')
    url.value = 'http://hooks.example.com'
    url.dispatchEvent(new Event('input'))
    await flushPromises()
    document.body.querySelector<HTMLFormElement>('#webhook-form')?.requestSubmit()
    await flushPromises()
    await vi.waitFor(() => expect(byTestId('webhook-dialog')?.textContent).toContain('Scegli almeno un evento'))
    expect(byTestId('webhook-dialog')?.textContent).toContain('Serve un indirizzo https')
    expect(byTestId('webhook-dialog')?.textContent).toContain('Scegli almeno un evento')
    url.value = 'https://hooks.example.com/new'
    url.dispatchEvent(new Event('input'))
    byTestId<HTMLInputElement>('webhook-event-job.closed')?.click()
    byTestId<HTMLInputElement>('webhook-event-application.received')?.click()
    await flushPromises()
    document.body.querySelector<HTMLFormElement>('#webhook-form')?.requestSubmit()
    await vi.waitFor(() => expect(state.created).toEqual([{ url: 'https://hooks.example.com/new', events: ['application.received', 'job.closed'], enabled: true }]))
    await vi.waitFor(() => expect(byTestId('webhook-secret')?.textContent).toBe('whsec_once'))
    expect(byTestId('webhook-dialog')?.textContent).toContain('non lo mostreremo più')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(byTestId('webhook-secret')).not.toBeNull()
    byTestId('webhook-secret-done')?.click()
    await vi.waitFor(() => expect(byTestId('webhook-secret')).toBeNull())
    expect(wrapper.findAll('[data-testid="webhook-item"]').length).toBe(2)
    expect(wrapper.text()).not.toContain('whsec_once')
  })

  it('sends a test and shows the delivery log with status codes', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="webhook-test"]').trigger('click')
    await vi.waitFor(() => expect(state.tests).toBe(1))
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="webhook-delivery"]').length).toBe(2))
    const [newest, oldest] = wrapper.findAll('[data-testid="webhook-delivery"]')
    expect(newest?.text()).toContain('timeout')
    expect(newest?.text()).toContain('Tentativo 2')
    expect(oldest?.text()).toContain('200')
    expect(oldest?.text()).toContain('Candidatura ricevuta')
  })

  it('pauses and deletes an endpoint after confirmation', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="webhook-toggle"]').trigger('click')
    await vi.waitFor(() => expect(state.puts).toEqual([{ url: 'https://hooks.example.com/tt', events: ['application.received', 'job.closed'], enabled: false }]))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="webhook-item"]').text()).toContain('In pausa'))
    await wrapper.find('[data-testid="webhook-delete"]').trigger('click')
    await vi.waitFor(() => expect(byTestId('confirm')).not.toBeNull())
    expect(document.body.textContent).toContain('https://hooks.example.com/tt non riceverà più eventi')
    byTestId('confirm')?.click()
    await vi.waitFor(() => expect(state.deletes).toBe(1))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="webhooks-empty"]').exists()).toBe(true))
  })
})
