import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { card, detail, pipeline } from '~~/test/fixtures/candidate-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import PipelinePanel from './PipelinePanel.vue'

const state = vi.hoisted(() => ({ calls: [] as { id: string; action: string; body: Record<string, string> }[], failMove: false }))
const tagged = card('a2', 'stage-0', { noteCount: 3, candidate: { ...card('a2').candidate, firstName: 'Niccolò', lastName: 'Bianchi', tags: ['golang', 'kafka'], location: 'Torino' } })
const decided = card('d1', 'stage-1', { outcome: 'not_selected', closedAt: '2026-10-14T10:00:00.000Z', candidate: { ...card('d1').candidate, firstName: 'Paolo', lastName: 'Verdi' } })
registerEndpoint('/api/v1/jobs/j1/pipeline', () => ok(pipeline([card('a1'), tagged, card('a3', 'stage-1', { hasCv: false }), decided])))
for (const id of ['a1', 'a2', 'a3']) {
  registerEndpoint(`/api/v1/applications/${id}/move`, {
    method: 'POST',
    handler: async (event) => {
      const body = await readBody<{ stageId: string }>(event)
      state.calls.push({ id, action: 'move', body })
      if (state.failMove) return (setResponseStatus(event, 409), { success: false, data: null, error: { code: 'conflict', message: 'decided' } })
      return ok(card(id, body.stageId, { stageChangedAt: '2026-10-15T10:00:00.000Z' }))
    },
  })
  registerEndpoint(`/api/v1/applications/${id}/decide`, {
    method: 'POST',
    handler: async (event) => {
      const body = await readBody<{ outcome: string }>(event)
      state.calls.push({ id, action: 'decide', body })
      return ok(card(id, 'received', { outcome: body.outcome as 'hired', closedAt: '2026-10-15T10:00:00.000Z' }))
    },
  })
}
registerEndpoint('/api/v1/candidates/c-a1', () => ok(detail({ candidate: { ...detail().candidate, id: 'c-a1' } })))

const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  const wrapper = await mountSuspended(PipelinePanel, { props: { jobId: 'j1' }, attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.findAll('[data-testid="pipeline-column"]').length).toBe(3))
  return wrapper
}
type Panel = Awaited<ReturnType<typeof mountPanel>>
const column = (wrapper: Panel, id: string) => wrapper.find(`[data-stage-id="${id}"]`)
const idsIn = (wrapper: Panel, id: string) => column(wrapper, id).findAll('[data-testid="candidate-card"]').map((node) => node.attributes('data-card-id'))
const nameButton = (wrapper: Panel, id: string) => wrapper.find(`[data-card-id="${id}"] [data-testid="card-name"]`)
const transfer = () => ({ setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '', dropEffect: '' })

beforeEach(() => {
  state.calls.length = 0
  state.failMove = false
  clearNuxtData('pipeline-j1')
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('PipelinePanel', () => {
  it('shows one column per stage, in order, with name, count and the cards', async () => {
    const wrapper = await mountPanel()
    const headers = wrapper.findAll('[data-testid="pipeline-column"] h2').map((node) => node.text())
    expect(headers).toEqual(['Ricevute', 'Chiamata conoscitiva', 'Colloquio tecnico'])
    expect(wrapper.findAll('[data-testid="column-count"]').map((node) => node.text())).toEqual(['1 candidatura1', '1 candidatura1', '1 candidatura1'])
    expect(column(wrapper, 'stage-0').text()).toContain('Recruiter · 30 min')
    const niccolo = wrapper.find('[data-card-id="a2"]')
    expect(niccolo.text()).toContain('Niccolò Bianchi')
    expect(niccolo.text()).toContain('Backend engineer')
    expect(niccolo.text()).toContain('6 anni di esperienza')
    expect(niccolo.text()).toContain('Torino')
    expect(niccolo.findAll('li').map((node) => node.text())).toContain('golang')
    expect(niccolo.find('[data-testid="card-notes"]').text()).toContain('3 note')
    expect(wrapper.find('[data-testid="pipeline-summary"]').text()).toBe('Aperte: 3 · Con esito: 1')
  })

  it('marks a card without a CV, and only that one', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-card-id="a3"] [data-testid="card-no-cv"]').text()).toBe('Senza CV')
    expect(wrapper.find('[data-card-id="a1"] [data-testid="card-no-cv"]').exists()).toBe(false)
  })

  it('filters cards as you type and says when a column has no match', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="pipeline-search"]').setValue('niccolo')
    expect(wrapper.findAll('[data-testid="candidate-card"]').map((node) => node.attributes('data-card-id'))).toEqual(['a2'])
    expect(column(wrapper, 'received').find('[data-testid="column-empty"]').text()).toBe('Nessun risultato in questa fase')
  })

  it('moves a card with the keyboard, announcing each step, and keeps it where the api put it', async () => {
    const wrapper = await mountPanel()
    await nameButton(wrapper, 'a1').trigger('keydown', { key: ' ' })
    expect(wrapper.find('[data-testid="board-live"]').text()).toContain('fase attuale: Ricevute')
    await nameButton(wrapper, 'a1').trigger('keydown', { key: 'ArrowRight' })
    expect(column(wrapper, 'stage-0').find('[data-testid="drop-indicator"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="board-live"]').text()).toContain('Chiamata conoscitiva')
    await nameButton(wrapper, 'a1').trigger('keydown', { key: ' ' })
    expect(idsIn(wrapper, 'stage-0')).toContain('a1')
    expect(wrapper.find('[data-testid="board-live"]').text()).toBe('Giulia Rossi a1 spostata in Chiamata conoscitiva')
    await vi.waitFor(() => expect(state.calls).toEqual([{ id: 'a1', action: 'move', body: { stageId: 'stage-0' } }]))
    await flushPromises()
    expect(idsIn(wrapper, 'stage-0')).toEqual(['a1', 'a2'])
  })

  it('cancels a keyboard move with Escape', async () => {
    const wrapper = await mountPanel()
    await nameButton(wrapper, 'a1').trigger('keydown', { key: ' ' })
    await nameButton(wrapper, 'a1').trigger('keydown', { key: 'ArrowRight' })
    await nameButton(wrapper, 'a1').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="board-live"]').text()).toContain('annullato')
    expect(idsIn(wrapper, 'received')).toEqual(['a1'])
    expect(state.calls).toEqual([])
  })

  it('moves a card by drag and drop with a drop line, and puts it back when the api refuses', async () => {
    state.failMove = true
    const wrapper = await mountPanel()
    const dataTransfer = transfer()
    await wrapper.find('[data-card-id="a3"]').trigger('dragstart', { dataTransfer })
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'a3')
    await column(wrapper, 'received').trigger('dragover', { dataTransfer })
    expect(column(wrapper, 'received').find('[data-testid="drop-indicator"]').exists()).toBe(true)
    await column(wrapper, 'received').trigger('drop', { dataTransfer })
    expect(idsIn(wrapper, 'received')).toContain('a3')
    await vi.waitFor(() => expect(state.calls.map((call) => call.body.stageId)).toEqual(['received']))
    await vi.waitFor(() => expect(idsIn(wrapper, 'stage-1')).toEqual(['a3']))
    expect(idsIn(wrapper, 'received')).toEqual(['a1'])
  })

  it('records an outcome from the card menu after confirmation', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-card-id="a1"] [data-testid="card-menu"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    const decide = document.body.querySelector<HTMLElement>('[data-testid="card-decide"]')
    decide?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flushPromises()
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="decide-hired"]')).not.toBeNull())
    document.body.querySelector<HTMLElement>('[data-testid="decide-hired"]')?.click()
    await flushPromises()
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="confirm"]')).not.toBeNull())
    expect(document.body.textContent).toContain("La candidatura di Giulia Rossi a1 si chiude con l'esito: Assunzione.")
    document.body.querySelector<HTMLElement>('[data-testid="confirm"]')?.click()
    await vi.waitFor(() => expect(state.calls).toEqual([{ id: 'a1', action: 'decide', body: { outcome: 'hired' } }]))
    expect(idsIn(wrapper, 'received')).toEqual([])
  })

  it('keeps decided applications in a collapsible outcomes area', async () => {
    const wrapper = await mountPanel()
    const outcomes = wrapper.find('[data-testid="outcomes"]')
    expect(outcomes.find('#outcomes-body').attributes('style')).toContain('display: none')
    await outcomes.find('[data-testid="outcomes-toggle"]').trigger('click')
    expect(outcomes.find('[data-outcome="not_selected"]').text()).toContain('Paolo Verdi')
    expect(outcomes.find('[data-card-id="d1"]').attributes('draggable')).toBe('false')
  })

  it('is read-only for interviewers', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-card-id="a1"]').attributes('draggable')).toBe('false')
    await nameButton(wrapper, 'a1').trigger('keydown', { key: ' ' })
    expect(wrapper.find('[data-testid="board-live"]').text()).toBe('')
    await wrapper.find('[data-card-id="a1"] [data-testid="card-menu"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(document.body.querySelector('[data-testid="card-open"]')).not.toBeNull()
    expect(document.body.querySelector('[data-testid="card-move"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="card-decide"]')).toBeNull()
  })

  it('opens the candidate in a side sheet with the way to the full page, both from this pipeline (a person to reconfirm stays visible)', async () => {
    const wrapper = await mountPanel()
    await nameButton(wrapper, 'a1').trigger('click')
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="candidate-name"]')?.textContent).toBe('Giulia Rossi'))
    expect(document.body.querySelector('[data-testid="open-full-page"]')?.getAttribute('href')).toBe('/app/candidates/c-a1?viaJobId=j1')
  })
})
