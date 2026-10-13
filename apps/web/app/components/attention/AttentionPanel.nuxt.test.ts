import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pipeline } from '~~/test/fixtures/candidate-fixtures'
import { makeJob, ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { TEMPLATES } from '~~/test/fixtures/message-fixtures'
import { attentionItem, staleJob } from '~~/test/fixtures/phase4-fixtures'
import AttentionPanel from './AttentionPanel.vue'

const state = vi.hoisted(() => ({ overdue: 1, dueSoon: 1, moves: [] as unknown[], asked: [] as string[], stale: [] as unknown[], closed: [] as string[] }))
registerEndpoint('/api/v1/jobs/stale', () => ok(state.stale))
registerEndpoint('/api/v1/jobs/j-stale/pipeline', () => ok(pipeline([])))
registerEndpoint('/api/v1/jobs/j-stale/close', {
  method: 'POST',
  handler: () => {
    state.closed.push('j-stale')
    state.stale = []
    return ok(makeJob({ id: 'j-stale', status: 'closed', closedAt: '2026-10-13T10:00:00.000Z' }))
  },
})
registerEndpoint('/api/v1/applications/attention', (event) => {
  const url = String(event.node.req.url)
  state.asked.push(url)
  const overdue = url.includes('state=overdue')
  const total = overdue ? state.overdue : state.dueSoon
  const limit = url.includes('limit=1&') || url.endsWith('limit=1') ? 1 : 25
  const items = overdue
    ? [attentionItem('a1')]
    : [attentionItem('a2', { state: 'due_soon', responseDueAt: '2026-10-14T16:00:00.000Z', ownerName: '', stage: { id: 'received', label: null } })]
  return ok(total === 0 ? [] : items.slice(0, limit), { total, page: 1, limit })
})
registerEndpoint('/api/v1/jobs/j1/pipeline', () => ok(pipeline()))
registerEndpoint('/api/v1/email-templates', () => ok(TEMPLATES))
registerEndpoint('/api/v1/applications/a1/move', {
  method: 'POST',
  handler: async (event) => {
    state.moves.push(await readBody(event))
    state.overdue = 0
    return ok({ ...pipeline().applications[0], id: 'a1', stageId: 'stage-1' })
  },
})

const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  const wrapper = await mountSuspended(AttentionPanel, { attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
const button = (testId: string) => document.body.querySelector<HTMLElement>(`[data-testid="${testId}"]`)

beforeEach(() => {
  state.overdue = 1
  state.dueSoon = 1
  state.moves.length = 0
  state.asked.length = 0
  state.stale = []
  state.closed.length = 0
  clearNuxtData()
  useState('attention-now').value = Date.parse('2026-10-13T10:00:00.000Z')
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('Da gestire', () => {
  it('lists late answers first, with countdown, job, stage and owner, then the near ones', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="attention-row"]').length).toBe(1))
    const row = wrapper.find('[data-testid="attention-row"]')
    expect(row.find('[data-testid="response-pill"]').text()).toContain('In ritardo di 2 giorni')
    expect(row.text()).toContain('Backend developer')
    expect(row.text()).toContain('Fase: Chiamata conoscitiva')
    expect(row.text()).toContain('Responsabile: Ada Lovelace')
    expect(row.find('[data-testid="attention-name"]').attributes('href')).toBe('/app/candidates/c-a1?application=a1')
    expect(wrapper.find('[data-testid="attention-tab-overdue"]').text()).toContain('1')
    await wrapper.find('[data-testid="attention-tab-due_soon"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-application-id="a2"]').exists()).toBe(true))
    expect(wrapper.find('[data-application-id="a2"]').text()).toContain('Fase: Ricevute')
    expect(wrapper.find('[data-application-id="a2"] [data-testid="response-pill"]').attributes('data-state')).toBe('due_soon')
  })

  it('moves from the row, after asking the stages of the job, and refreshes', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="attention-move"]').exists()).toBe(true))
    await wrapper.find('[data-testid="attention-move"]').trigger('keydown', { key: 'Enter' })
    await vi.waitFor(() => expect(button('attention-move-to-stage-1')).not.toBeNull())
    expect(button('attention-move-to-stage-0')?.getAttribute('data-disabled')).not.toBeNull()
    button('attention-move-to-stage-1')?.click()
    await vi.waitFor(() => expect(state.moves).toEqual([{ stageId: 'stage-1' }]))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="attention-tab-overdue"]').text()).toContain('0'))
  })

  it('opens the composer for the row, one recipient, nothing sent by itself', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="attention-message"]').exists()).toBe(true))
    await wrapper.find('[data-testid="attention-message"]').trigger('click')
    await vi.waitFor(() => expect(button('bulk-recipient-list')?.textContent).toContain('Giulia Rossi a1'))
  })

  it('celebrates when nothing waits, without numbers', async () => {
    state.overdue = 0
    state.dueSoon = 0
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="attention-all-done"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="attention-all-done"]').text()).toContain('Ogni candidato ha la sua risposta')
    expect(wrapper.find('[data-testid="attention-all-done"]').text()).not.toMatch(/\d/)
  })

  it('says when one tab is empty while the other is not', async () => {
    state.overdue = 0
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="attention-empty"]').text()).toBe('Nessuna candidatura in ritardo.'))
  })

  it('keeps the tabs when only stale ads wait, instead of the all-done block', async () => {
    state.overdue = 0
    state.dueSoon = 0
    state.stale = [staleJob('j-stale', 120)]
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="attention-tab-stale"]').text()).toContain('1'))
    expect(wrapper.find('[data-testid="attention-all-done"]').exists()).toBe(false)
  })

  it('says when no ad is stale', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="attention-tab-stale"]').exists()).toBe(true))
    await wrapper.find('[data-testid="attention-tab-stale"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="attention-stale-empty"]').text()).toBe('Nessun annuncio fermo da più di 90 giorni'))
  })

  it('lists the stale ads in a third tab, and closes one after the confirmation', async () => {
    state.stale = [staleJob('j-stale', 120)]
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="attention-tab-stale"]').text()).toContain('1'))
    await wrapper.find('[data-testid="attention-tab-stale"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="attention-stale-row"]').exists()).toBe(true))
    const row = wrapper.find('[data-testid="attention-stale-row"]')
    expect(row.find('[data-testid="attention-stale-title"]').attributes('href')).toBe('/app/jobs/j-stale')
    expect(row.text()).toContain('Annuncio j-stale')
    expect(row.text()).toContain('Nessuna attività da 120 giorni')
    expect(row.find('[data-testid="attention-stale-open"]').attributes('href')).toBe('/app/jobs/j-stale')
    await row.find('[data-testid="attention-stale-close"]').trigger('click')
    await vi.waitFor(() => expect(button('confirm')?.hasAttribute('disabled')).toBe(false))
    button('confirm')?.click()
    await vi.waitFor(() => expect(state.closed).toEqual(['j-stale']))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="attention-stale-row"]').exists()).toBe(false))
    expect(wrapper.find('[data-testid="attention-tab-stale"]').text()).toContain('0')
  })

  it('hides write and move without the permissions', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="attention-open"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="attention-message"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="attention-move"]').exists()).toBe(false)
    await flushPromises()
  })
})
