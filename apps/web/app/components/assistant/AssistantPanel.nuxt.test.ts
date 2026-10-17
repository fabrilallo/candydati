import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import AssistantPanel from './AssistantPanel.vue'

const state = vi.hoisted(() => ({ bodies: [] as Record<string, unknown>[], enabled: true, chatStatus: 200 }))

const sse = (chunks: readonly unknown[]): Response =>
  new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`, {
    headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
  })

const draft = { status: 'draft_not_sent', applicationId: 'a1', subject: 'Grazie, Giulia', body: 'Ciao Giulia, ti scriviamo entro venerdì.', unknownVariables: [] }
const turn = [
  { type: 'start', messageId: 'r1' },
  { type: 'start-step' },
  { type: 'tool-input-available', toolCallId: 'c1', toolName: 'get_candidate_brief', input: {} },
  { type: 'tool-output-available', toolCallId: 'c1', output: { data: '<candidate_data>…</candidate_data>' } },
  { type: 'tool-input-available', toolCallId: 'c2', toolName: 'draft_message', input: {} },
  { type: 'tool-output-available', toolCallId: 'c2', output: draft },
  { type: 'finish-step' },
  { type: 'start-step' },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: 'Ecco una **bozza**. <b>niente html</b>' },
  { type: 'text-end', id: 't1' },
  { type: 'finish-step' },
  { type: 'finish' },
]

registerEndpoint('/api/v1/agent/status', () => ok({ enabled: state.enabled, model: state.enabled ? 'mistral/small' : null }))
registerEndpoint('/api/v1/agent/chat', async (event) => {
  state.bodies.push(await readBody(event))
  if (state.chatStatus !== 200) return new Response(JSON.stringify({ success: false, data: null, error: { code: 'agent_disabled', message: 'off' } }), { status: state.chatStatus })
  return sse(turn)
})
registerEndpoint('/api/v1/email-templates', () => ok([]))
registerEndpoint('/api/v1/messages/preview', () => ok({ subject: 'Grazie, Giulia', body: 'Ciao Giulia', unknownVariables: [] }))

const mounted: { unmount: () => void }[] = []
const byTestId = <T extends HTMLElement = HTMLElement>(testId: string) => document.body.querySelector<T>(`[data-testid="${testId}"]`)
const mountPanel = async () => {
  const wrapper = await mountSuspended(AssistantPanel, { attachTo: document.body, route: '/app/candidates/c1?application=a1' })
  mounted.push(wrapper)
  useAssistant().open.value = true
  await vi.waitFor(() => expect(byTestId('assistant-panel')).not.toBeNull())
  return wrapper
}
const type = async (text: string) => {
  const input = byTestId<HTMLTextAreaElement>('assistant-input')
  if (!input) throw new Error('no input')
  input.value = text
  input.dispatchEvent(new Event('input'))
  await flushPromises()
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await flushPromises()
}

beforeEach(() => {
  state.bodies.length = 0
  state.enabled = true
  state.chatStatus = 200
  clearNuxtData()
  clearNuxtState('assistant-configured')
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => {
  useAssistant().open.value = false
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})

describe('assistant panel', () => {
  it('opens on an empty conversation with the promise, the page and suggestions for it', async () => {
    await mountPanel()
    expect(byTestId('assistant-promise')?.textContent).toContain("L'assistente non valuta e non scarta candidati.")
    expect(byTestId('assistant-page')?.textContent).toContain('Scheda candidato')
    expect(byTestId('assistant-suggestion-reply')?.textContent).toContain('Prepara una risposta per questa candidatura')
    expect(byTestId('assistant-suggestion-today')).not.toBeNull()
  })

  it('sends the page with the message, streams steps, safe text and a draft card, then hands the draft to the composer', async () => {
    await mountPanel()
    byTestId<HTMLButtonElement>('assistant-suggestion-reply')?.click()
    await vi.waitFor(() => expect(byTestId('draft-message-card')).not.toBeNull())
    expect(state.bodies[0]).toMatchObject({ page: { route: '/app/candidates/c1', view: 'candidate', candidateId: 'c1', applicationId: 'a1' } })
    expect(state.bodies[0]).not.toHaveProperty('threadId')
    const panel = byTestId('assistant-panel')
    expect(panel?.textContent).toContain('Ho letto la candidatura')
    expect(panel?.textContent).toContain('Ho preparato una bozza di messaggio')
    expect(panel?.querySelector('strong')?.textContent).toBe('bozza')
    expect(panel?.querySelector('b')).toBeNull()
    expect(panel?.textContent).toContain('<b>niente html</b>')
    expect(byTestId('draft-message-card')?.textContent).toContain('Bozza per questa persona')

    const subject = byTestId<HTMLInputElement>('draft-subject')
    if (!subject) throw new Error('no subject')
    subject.value = 'Grazie davvero'
    subject.dispatchEvent(new Event('input'))
    await flushPromises()
    byTestId<HTMLButtonElement>('draft-review')?.click()
    await vi.waitFor(() => expect(byTestId('bulk-composer')).not.toBeNull())
    expect(useAssistant().open.value).toBe(false)
    expect(byTestId<HTMLInputElement>('composer-subject')?.value).toBe('Grazie davvero')
    expect(byTestId<HTMLTextAreaElement>('composer-body')?.value).toBe(draft.body)
    expect(byTestId('bulk-recipient-list')?.textContent).toContain('questa persona')  })

  it('starts over: clears the conversation and sends only the new messages', async () => {
    await mountPanel()
    await type('Cosa devo fare oggi?')
    await vi.waitFor(() => expect(byTestId('assistant-reset')).not.toBeNull())
    byTestId<HTMLButtonElement>('assistant-reset')?.click()
    await vi.waitFor(() => expect(byTestId('assistant-empty')).not.toBeNull())
    await type('Di nuovo')
    await vi.waitFor(() => expect(state.bodies.length).toBe(2))
    expect((state.bodies[1]?.messages as unknown[]).length).toBe(1)
  })

  it('opens and closes with Ctrl or Cmd plus J from anywhere', async () => {
    const wrapper = await mountSuspended(AssistantPanel, { attachTo: document.body })
    mounted.push(wrapper)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }))
    expect(useAssistant().open.value).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true }))
    expect(useAssistant().open.value).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))
    expect(useAssistant().open.value).toBe(false)
  })

  it('explains calmly when no model is configured, with the way to the AI settings for admins', async () => {
    state.enabled = false
    useViewer().viewer.value = viewerWith('admin')
    await mountPanel()
    await vi.waitFor(() => expect(byTestId('assistant-off')).not.toBeNull())
    expect(byTestId('assistant-off-settings')?.getAttribute('href')).toBe('/app/settings/ai')
    expect(byTestId('assistant-off')?.textContent).not.toContain('AGENT_MODEL')
    expect(byTestId<HTMLTextAreaElement>('assistant-input')?.disabled).toBe(true)
  })

  it('learns the agent is off from the chat when there is no status route', async () => {
    registerEndpoint('/api/v1/agent/status', () => new Response('not found', { status: 404 }))
    state.chatStatus = 503
    await mountPanel()
    await type('Ciao')
    await vi.waitFor(() => expect(byTestId('assistant-off')).not.toBeNull())
    expect(byTestId('assistant-off-settings')).toBeNull()
    expect(byTestId('assistant-off')?.textContent).toContain("chiedi a chi amministra")
    expect(byTestId('assistant-error')).toBeNull()
    registerEndpoint('/api/v1/agent/status', () => ok({ enabled: state.enabled, model: state.enabled ? 'mistral/small' : null }))
  })
})
