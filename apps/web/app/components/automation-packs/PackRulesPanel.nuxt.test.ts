import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutomationPackRuleDto } from '@candydati/domain'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { template } from '~~/test/fixtures/message-fixtures'
import PackRulesPanel from './PackRulesPanel.vue'

const { api, state } = vi.hoisted(() => ({
  api: { getFullOrganization: async () => ({ id: 'o1', name: 'Acme', slug: 'acme', members: [{ id: 'm2', userId: 'u2', role: 'recruiter', name: 'Bruno', email: 'bruno@example.com' }], invitations: [] }) },
  state: { posts: [] as unknown[], puts: [] as unknown[] },
}))
mockNuxtImport('useAuthApi', () => () => api)

const packRule = (id: string, overrides: Partial<AutomationPackRuleDto> = {}): AutomationPackRuleDto => ({
  id, packId: 'p1', stage: 'technical_interview', trigger: { type: 'stage_entered' }, conditions: {}, action: { type: 'request_feedback' },
  enabled: true, createdBy: 'u2', createdAt: '2026-10-01T00:00:00.000Z', ...overrides,
})
registerEndpoint('/api/v1/email-templates', () => ok([template('t-update', { name: 'Aggiornamento sulla fase', kind: 'stage_update' })]))
registerEndpoint('/api/v1/automation-packs/p1/rules', async (event) => {
  if (event.method !== 'POST') return ok([packRule('a'), packRule('b', { stage: 'received', action: { type: 'add_tag', tag: 'nuovo' } })])
  const body = await readBody<{ stage: AutomationPackRuleDto['stage']; action: AutomationPackRuleDto['action'] }>(event)
  state.posts.push(body)
  return ok(packRule('c', { stage: body.stage, action: body.action }))
})
registerEndpoint('/api/v1/automation-pack-rules/a', async (event) => {
  state.puts.push(await readBody(event))
  return ok(packRule('a', { enabled: false }))
})

const mounted: { unmount: () => void }[] = []
const el = (testId: string) => document.body.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
const choose = (testId: string, value: string): void => {
  const select = document.body.querySelector<HTMLSelectElement>(`[data-testid="${testId}"]`)
  if (!select) throw new Error(`no ${testId}`)
  select.value = value
  select.dispatchEvent(new Event('change'))
}
beforeEach(() => {
  state.posts.length = 0
  state.puts.length = 0
  clearNuxtData()
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('rules of a pack', () => {
  it('groups rules by kind of stage in pipeline order, without copy, and pauses one', async () => {
    const wrapper = await mountSuspended(PackRulesPanel, { props: { packId: 'p1' }, attachTo: document.body })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="pack-anchor"] h2').map((h) => h.text())).toEqual(['Fase Ricevute', 'Fase Colloquio tecnico']))
    expect(wrapper.find('[data-testid="rule-copy"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pack-note"]').text()).toContain('non spostano e non decidono mai')
    await wrapper.find('[data-rule-id="a"] [data-testid="rule-toggle"]').trigger('click')
    await vi.waitFor(() => expect(state.puts).toEqual([{ stage: 'technical_interview', trigger: { type: 'stage_entered' }, conditions: {}, enabled: false, action: { type: 'request_feedback' } }]))
  })

  it('adds a rule only once a kind of stage is chosen, and proposes moves only to other kinds', async () => {
    const wrapper = await mountSuspended(PackRulesPanel, { props: { packId: 'p1' }, attachTo: document.body })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="automation-rule"]').length).toBe(2))
    await wrapper.find('[data-testid="pack-rule-add"]').trigger('click')
    await vi.waitFor(() => expect(el('pack-rule-dialog')).not.toBeNull())
    choose('rule-action', 'add_tag')
    await flushPromises()
    const tag = document.body.querySelector<HTMLInputElement>('[data-testid="rule-tag"]')
    if (!tag) throw new Error('no tag field')
    tag.value = 'senior'
    tag.dispatchEvent(new Event('input'))
    document.body.querySelector<HTMLFormElement>('#pack-rule-form')?.requestSubmit()
    await vi.waitFor(() => expect(el('pack-rule-dialog')?.textContent).toContain('Scegli il tipo di fase'))
    expect(state.posts).toEqual([])
    choose('pack-rule-stage', 'hr_interview')
    choose('rule-action', 'propose_move')
    await flushPromises()
    const targets = [...document.body.querySelectorAll<HTMLOptionElement>('[data-testid="rule-to-stage"] option')].map((o) => o.value).filter(Boolean)
    expect(targets).not.toContain('received')
    expect(targets).not.toContain('hr_interview')
    choose('rule-to-stage', 'technical_interview')
    await flushPromises()
    document.body.querySelector<HTMLFormElement>('#pack-rule-form')?.requestSubmit()
    await vi.waitFor(() => expect(state.posts).toEqual([{ stage: 'hr_interview', trigger: { type: 'stage_entered' }, conditions: {}, enabled: true, action: { type: 'propose_move', toStageId: 'technical_interview' } }]))
  })
})
