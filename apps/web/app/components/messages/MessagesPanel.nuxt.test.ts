import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { card, detail } from '~~/test/fixtures/candidate-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { inbound, message, TEMPLATES } from '~~/test/fixtures/message-fixtures'
import CandidateDetailView from '../candidate/CandidateDetailView.vue'

const state = vi.hoisted(() => ({
  sends: [] as unknown[],
  previews: [] as { subject: string; body: string; applicationId: string }[],
  messages: [] as unknown[],
  refuse: false,
}))
registerEndpoint('/api/v1/candidates/c1', () => ok(detail()))
registerEndpoint('/api/v1/applications/a1/messages', () => ok(state.messages))
registerEndpoint('/api/v1/email-templates', () => ok(TEMPLATES))
registerEndpoint('/api/v1/email-templates/preview', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<{ subject: string; body: string; applicationId: string }>(event)
    state.previews.push(body)
    const fill = (text: string) => text.replaceAll('{{ candidate.firstName }}', 'Giulia').replaceAll('{{ job.title }}', 'Backend developer')
    const unknown = [...`${body.subject} ${body.body}`.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map((match) => match[1]).filter((name) => name === 'job.salary')
    return ok({ subject: fill(body.subject), body: fill(body.body), unknownVariables: unknown })
  },
})
registerEndpoint('/api/v1/messages', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody(event)
    state.sends.push(body)
    if (state.refuse) return (setResponseStatus(event, 422), { success: false, data: null, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'body', message: 'unknown_variable:job.bonus' }] } })
    state.messages = [...state.messages, message('m9', { status: 'queued', sentAt: null, subject: 'Nuovo' })]
    return ok({ queued: 1 })
  },
})
registerEndpoint('/api/v1/applications/a1/decide', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<{ outcome: 'not_selected' }>(event)
    return ok(card('a1', 'stage-0', { outcome: body.outcome, closedAt: '2026-10-15T10:00:00.000Z' }))
  },
})

const mounted: { unmount: () => void }[] = []
const mountDetail = async () => {
  const wrapper = await mountSuspended(CandidateDetailView, { props: { candidateId: 'c1' }, attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="candidate-name"]').exists()).toBe(true))
  return wrapper
}
type Detail = Awaited<ReturnType<typeof mountDetail>>
const openMessages = async (wrapper: Detail) => {
  await wrapper.find('[data-testid="tab-messages"]').trigger('click')
  await vi.waitFor(() => expect(wrapper.find('[data-testid="thread-loading"]').exists()).toBe(false))
}
const write = async (wrapper: Detail, subject: string, body: string) => {
  await wrapper.find('[data-testid="composer-subject"]').setValue(subject)
  await wrapper.find('[data-testid="composer-body"]').setValue(body)
}
const button = (testId: string) => document.body.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)

beforeEach(() => {
  state.sends.length = 0
  state.previews.length = 0
  state.messages = [message('m1'), inbound('m2')]
  state.refuse = false
  clearNuxtData()
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('Messaggi tab', () => {
  it('counts the messages and shows the conversation oldest first, ours and theirs apart', async () => {
    state.messages = [inbound('m2'), message('m1')]
    const wrapper = await mountDetail()
    expect(wrapper.find('[data-testid="tab-messages"]').text()).toContain('2')
    await openMessages(wrapper)
    const items = wrapper.findAll('[data-testid="message"]')
    expect(items.map((item) => item.attributes('data-direction'))).toEqual(['outbound', 'inbound'])
    expect(items[0]?.find('[data-testid="message-author"]').text()).toBe('Ada Lovelace')
    expect(items[0]?.find('[data-testid="message-status"]').text()).toBe('Inviato')
    expect(items[1]?.find('[data-testid="message-author"]').text()).toBe('Giulia Rossi')
    expect(items[1]?.find('[data-testid="message-status"]').exists()).toBe(false)
  })

  it('renders an inbound body as text, never HTML, and warns about an unverified sender', async () => {
    state.messages = [inbound('m2', { bodyText: '<img src=x onerror=alert(1)> ciao', unverifiedSender: true })]
    const wrapper = await mountDetail()
    await openMessages(wrapper)
    const body = wrapper.find('[data-testid="message-body"]')
    expect(body.find('img').exists()).toBe(false)
    expect(body.text()).toBe('<img src=x onerror=alert(1)> ciao')
    expect(wrapper.find('[data-testid="message-unverified"]').text()).toContain('Mittente non verificato')
  })

  it('says why a message was not delivered and labels automatic ones', async () => {
    state.messages = [message('m1', { status: 'failed', sentAt: null, error: 'delivery_rejected', sentBy: { id: 'system', name: 'system' } }), message('m3', { status: 'queued', sentAt: null })]
    const wrapper = await mountDetail()
    await openMessages(wrapper)
    const [failed, queued] = wrapper.findAll('[data-testid="message"]')
    expect(failed?.find('[data-testid="message-author"]').text()).toBe('Inviato in automatico')
    expect(failed?.find('[data-testid="message-status"]').text()).toBe('Non consegnato')
    expect(failed?.find('[data-testid="message-error"]').text()).toContain('ha rifiutato il messaggio')
    expect(queued?.find('[data-testid="message-status"]').text()).toBe('In coda')
  })

  it('fills the composer from a template and previews it for this candidate, debounced', async () => {
    const wrapper = await mountDetail()
    await openMessages(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="composer-template"] option[value="t-no"]').exists()).toBe(true))
    await wrapper.find('[data-testid="composer-template"]').setValue('t-no')
    expect((wrapper.find('[data-testid="composer-subject"]').element as HTMLInputElement).value).toBe('La tua candidatura per {{ job.title }}')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="preview-subject"]').text()).toBe('La tua candidatura per Backend developer'))
    expect(state.previews).toHaveLength(1)
    expect(state.previews[0]?.applicationId).toBe('a1')
  })

  it('inserts a variable at the cursor', async () => {
    const wrapper = await mountDetail()
    await openMessages(wrapper)
    await write(wrapper, 'Ciao', 'Ciao , a presto')
    const body = wrapper.find('[data-testid="composer-body"]').element as HTMLTextAreaElement
    body.focus()
    body.setSelectionRange(5, 5)
    await wrapper.find('[data-testid="variable-picker"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    button('variable-candidate.firstName')?.click()
    await flushPromises()
    expect(body.value).toBe('Ciao {{ candidate.firstName }}, a presto')
    expect(body.selectionStart).toBe(30)
  })

  it('highlights unknown variables and blocks the send until they are fixed', async () => {
    const wrapper = await mountDetail()
    await openMessages(wrapper)
    await write(wrapper, 'Offerta', 'La RAL è {{ job.salary }}')
    expect(wrapper.find('[data-testid="unknown-variables"]').text()).toContain('job.salary')
    expect(wrapper.find('[data-testid="composer-send"]').attributes('disabled')).toBeDefined()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="preview-body"] [data-testid="unknown-variable"]').text()).toBe('{{ job.salary }}'))
    await wrapper.find('[data-testid="composer-body"]').setValue('Ciao {{ candidate.firstName }}')
    expect(wrapper.find('[data-testid="unknown-variables"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="composer-send"]').attributes('disabled')).toBeUndefined()
  })

  it('sends only after a confirmation that names the recipient, then shows the queued message', async () => {
    const wrapper = await mountDetail()
    await openMessages(wrapper)
    await write(wrapper, 'Colloquio', 'Ciao {{ candidate.firstName }}')
    await wrapper.find('[data-testid="message-composer"]').trigger('submit')
    await flushPromises()
    expect(state.sends).toEqual([])
    expect(document.body.textContent).toContain('Il messaggio va a Giulia Rossi (giulia@example.com)')
    button('confirm')?.click()
    await vi.waitFor(() => expect(state.sends).toEqual([{ applicationIds: ['a1'], subject: 'Colloquio', body: 'Ciao {{ candidate.firstName }}' }]))
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="message"]')).toHaveLength(3))
    expect(wrapper.find('[data-testid="tab-messages"]').text()).toContain('3')
    expect((wrapper.find('[data-testid="composer-subject"]').element as HTMLInputElement).value).toBe('')
  })

  it('names the unknown variable the api refused and keeps the draft', async () => {
    state.refuse = true
    const wrapper = await mountDetail()
    await openMessages(wrapper)
    await write(wrapper, 'Colloquio', 'Ciao')
    await wrapper.find('[data-testid="message-composer"]').trigger('submit')
    await flushPromises()
    button('confirm')?.click()
    await vi.waitFor(() => expect(document.body.textContent).toContain('Il messaggio contiene variabili sconosciute'))
    expect(wrapper.find('[data-testid="unknown-variables"]').text()).toContain('job.bonus')
    expect((wrapper.find('[data-testid="composer-body"]').element as HTMLTextAreaElement).value).toBe('Ciao')
  })

  it('after an outcome, opens the composer prefilled with the outcome template, and never sends by itself', async () => {
    const wrapper = await mountDetail()
    await wrapper.find('[data-testid="decide-menu"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    button('detail-decide-not_selected')?.click()
    await flushPromises()
    button('confirm')?.click()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="outcome-proposal"]').exists()).toBe(true))
    await vi.waitFor(() => expect((wrapper.find('[data-testid="composer-body"]').element as HTMLTextAreaElement).value).toContain('grazie del tempo'))
    expect(state.sends).toEqual([])
    await wrapper.find('[data-testid="composer-skip"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="outcome-proposal"]').exists()).toBe(false)
    expect((wrapper.find('[data-testid="composer-body"]').element as HTMLTextAreaElement).value).toBe('')
  })

  it('lets hiring managers read the conversation but not write', async () => {
    useViewer().viewer.value = viewerWith('hiring_manager')
    const wrapper = await mountDetail()
    await openMessages(wrapper)
    expect(wrapper.findAll('[data-testid="message"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="message-composer"]').exists()).toBe(false)
  })
})
