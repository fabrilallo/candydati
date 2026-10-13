import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { card, pipeline } from '~~/test/fixtures/candidate-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { TEMPLATES } from '~~/test/fixtures/message-fixtures'
import PipelinePanel from '../pipeline/PipelinePanel.vue'

const state = vi.hoisted(() => ({ sends: [] as { applicationIds: string[] }[], previews: [] as string[] }))
const named = (id: string, stageId: string, firstName: string) => card(id, stageId, { candidate: { ...card(id).candidate, firstName, lastName: 'Test' } })
registerEndpoint('/api/v1/jobs/j1/pipeline', () =>
  ok(pipeline([named('a1', 'received', 'Anna'), named('a2', 'received', 'Bruno'), named('a3', 'received', 'Carla'), named('a4', 'stage-0', 'Dario'), named('a5', 'stage-1', 'Elena')])),
)
registerEndpoint('/api/v1/email-templates', () => ok(TEMPLATES))
registerEndpoint('/api/v1/email-templates/preview', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<{ subject: string; body: string; applicationId: string }>(event)
    state.previews.push(body.applicationId)
    return ok({ subject: body.subject, body: body.body.replaceAll('{{ candidate.firstName }}', 'Anna'), unknownVariables: [] })
  },
})
registerEndpoint('/api/v1/messages', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<{ applicationIds: string[] }>(event)
    state.sends.push(body)
    return ok({ queued: body.applicationIds.length, failed: 0 })
  },
})
registerEndpoint('/api/v1/applications/a4/decide', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<{ outcome: 'hired' }>(event)
    return ok({ ...named('a4', 'stage-0', 'Dario'), outcome: body.outcome, closedAt: '2026-10-15T10:00:00.000Z' })
  },
})

const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  const wrapper = await mountSuspended(PipelinePanel, { props: { jobId: 'j1' }, attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.findAll('[data-testid="pipeline-column"]').length).toBe(3))
  return wrapper
}
type Panel = Awaited<ReturnType<typeof mountPanel>>
const check = async (wrapper: Panel, id: string, shiftKey = false) => {
  await wrapper.find(`[data-card-id="${id}"] [data-testid="card-select"]`).trigger('click', { shiftKey })
}
const checked = (wrapper: Panel) =>
  wrapper
    .findAll('[data-testid="card-select"]')
    .filter((node) => (node.element as HTMLInputElement).checked)
    .map((node) => node.element.closest('[data-card-id]')?.getAttribute('data-card-id'))
const button = (testId: string) => document.body.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)

beforeEach(() => {
  state.sends.length = 0
  state.previews.length = 0
  clearNuxtData()
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('bulk messages from the board', () => {
  it('selects with shift ranges and whole columns, showing the count in a sticky bar', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="selection-bar"]').exists()).toBe(false)
    const order = wrapper.findAll('[data-stage-id="received"] [data-testid="candidate-card"]').map((node) => node.attributes('data-card-id') ?? '')
    await check(wrapper, order[0] ?? '')
    await check(wrapper, order[2] ?? '', true)
    expect(checked(wrapper).sort()).toEqual(['a1', 'a2', 'a3'])
    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe('3 selezionate')
    await wrapper.find('[data-stage-id="stage-0"] [data-testid="column-select-all"]').trigger('change')
    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe('4 selezionate')
    await wrapper.find('[data-testid="selection-clear"]').trigger('click')
    expect(wrapper.find('[data-testid="selection-bar"]').exists()).toBe(false)
  })

  it('turns selection mode on with "Seleziona" and off again', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="column-select-all"]').exists()).toBe(false)
    await wrapper.find('[data-testid="selection-toggle"]').trigger('click')
    expect(wrapper.find('[data-testid="selection-toggle"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('[data-testid="column-select-all"]').length).toBe(3)
    await wrapper.find('[data-testid="selection-toggle"]').trigger('click')
    expect(wrapper.find('[data-testid="column-select-all"]').exists()).toBe(false)
  })

  it('writes to everyone selected after a confirmation with the number, previewing the first', async () => {
    const wrapper = await mountPanel()
    await check(wrapper, 'a4')
    await check(wrapper, 'a5')
    await wrapper.find('[data-testid="selection-message"]').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[data-testid="bulk-recipient-list"]')?.textContent).toContain('Dario Test')
    expect(document.body.querySelector('[data-testid="bulk-composer"]')?.textContent).toContain('2 destinatari')
    const subject = document.body.querySelector<HTMLInputElement>('[data-testid="composer-subject"]')
    const body = document.body.querySelector<HTMLTextAreaElement>('[data-testid="composer-body"]')
    if (!subject || !body) throw new Error('composer missing')
    subject.value = 'Aggiornamento'
    subject.dispatchEvent(new Event('input'))
    body.value = 'Ciao {{ candidate.firstName }}'
    body.dispatchEvent(new Event('input'))
    await vi.waitFor(() => expect(state.previews).toContain('a4'))
    document.body.querySelector<HTMLFormElement>('[data-testid="bulk-composer"] [data-testid="message-composer"]')?.requestSubmit()
    await flushPromises()
    expect(document.body.textContent).toContain('Il messaggio va a 2 persone')
    expect(button('confirm')?.textContent).toContain('Invia a 2 persone')
    expect(state.sends).toEqual([])
    button('confirm')?.click()
    await vi.waitFor(() => expect(state.sends.map((send) => send.applicationIds)).toEqual([['a4', 'a5']]))
    await flushPromises()
    expect(wrapper.find('[data-testid="selection-bar"]').exists()).toBe(false)
  })

  it('proposes the outcome template right after deciding from the board', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-card-id="a4"] [data-testid="card-menu"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    button('card-decide')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await vi.waitFor(() => expect(button('decide-hired')).not.toBeNull())
    button('decide-hired')?.click()
    await vi.waitFor(() => expect(button('confirm')).not.toBeNull())
    button('confirm')?.click()
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="bulk-composer"]')?.textContent).toContain("Messaggio per l'esito"))
    await vi.waitFor(() => expect(document.body.querySelector<HTMLInputElement>('[data-testid="composer-subject"]')?.value).toBe('Benvenuta in {{ organization.name }}'))
    expect(state.sends).toEqual([])
    button('composer-skip')?.click()
    await flushPromises()
    expect(document.body.querySelector('[data-testid="bulk-composer"]')).toBeNull()
  })

  it('offers no selection without message:send', async () => {
    useViewer().viewer.value = viewerWith('hiring_manager')
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="card-select"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="selection-toggle"]').exists()).toBe(false)
  })
})
