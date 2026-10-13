import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeJob, ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { template } from '~~/test/fixtures/message-fixtures'
import { rule, taskAction } from '~~/test/fixtures/phase4-fixtures'
import AutomationsPanel from './AutomationsPanel.vue'

const { api, state } = vi.hoisted(() => ({
  api: {
    getFullOrganization: async () => ({
      id: 'o1',
      name: 'Acme',
      slug: 'acme',
      members: [{ id: 'm2', userId: 'u2', role: 'recruiter', name: 'Bruno', email: 'bruno@example.com' }],
      invitations: [],
    }),
  },
  state: { posts: [] as unknown[], puts: [] as unknown[], deletes: 0 },
}))
mockNuxtImport('useAuthApi', () => () => api)

const job = makeJob({
  status: 'published',
  content: {
    ...makeJob().content,
    process: [
      { id: 'screen', type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' },
      { id: 'tech', title: 'Colloquio tecnico', type: 'technical_interview', durationMinutes: 90, conductedBy: 'technical_lead' },
    ],
  },
})
registerEndpoint('/api/v1/email-templates', () => ok([template('t-update', { name: 'Aggiornamento sulla fase', kind: 'stage_update' })]))
registerEndpoint('/api/v1/jobs/j1/automations', async (event) => {
  if (event.method !== 'POST') {
    return ok([rule('r1', { stageId: 'tech' }), rule('r2', { stageId: 'tech', action: taskAction('Prepara il colloquio', 'job_owner', 2), createdAt: '2026-10-14T10:00:00.000Z' })])
  }
  const body = await readBody<{ stageId: string; action: never }>(event)
  state.posts.push(body)
  return ok(rule('r9', { stageId: body.stageId, action: body.action, createdBy: { id: 'u1', name: null } }))
})
registerEndpoint('/api/v1/automations/r1', async (event) => {
  if (event.method === 'DELETE') {
    state.deletes += 1
    return ok(null)
  }
  const body = await readBody<{ enabled: boolean }>(event)
  state.puts.push(body)
  return ok(rule('r1', { stageId: 'tech', enabled: body.enabled }))
})

const mounted: { unmount: () => void }[] = []
const button = (testId: string) => document.body.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
const mountPanel = async () => {
  const wrapper = await mountSuspended(AutomationsPanel, { props: { job }, attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.findAll('[data-testid="automation-rule"]').length).toBe(2))
  return wrapper
}
beforeEach(() => {
  state.posts.length = 0
  state.puts.length = 0
  state.deletes = 0
  clearNuxtData()
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('automations per stage', () => {
  it('shows one section per stage with the board names and each rule as a sentence', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.findAll('[data-testid="automation-stage"] h2').map((heading) => heading.text())).toEqual([
      'Quando una candidatura entra in Ricevute',
      'Quando una candidatura entra in Chiamata conoscitiva',
      'Quando una candidatura entra in Colloquio tecnico',
    ])
    await vi.waitFor(() => expect(wrapper.find('[data-rule-id="r1"] [data-testid="rule-sentence"]').text()).toBe('invia il modello «Aggiornamento sulla fase»'))
    expect(wrapper.find('[data-rule-id="r2"] [data-testid="rule-sentence"]').text()).toBe("crea l'attività «Prepara il colloquio» per il responsabile dell'annuncio, da fare entro 2 giorni")
    expect(wrapper.find('[data-rule-id="r1"]').text()).toContain('Creata da Ada')
    expect(wrapper.find('[data-testid="automations-note"]').text()).toContain('non spostano e non decidono mai')
  })

  it('adds a task rule for a member of the team', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="automation-add-screen"]').trigger('click')
    await vi.waitFor(() => expect(button('rule-dialog')?.textContent).toContain('Nuova regola: Chiamata conoscitiva'))
    const action = document.body.querySelector<HTMLSelectElement>('[data-testid="rule-action"]')
    if (!action) throw new Error('no action select')
    action.value = 'create_task'
    action.dispatchEvent(new Event('change'))
    await flushPromises()
    document.body.querySelector<HTMLFormElement>('#rule-form')?.requestSubmit()
    await flushPromises()
    expect(button('rule-dialog')?.textContent).toContain("Scrivi cosa c'è da fare")
    const title = document.body.querySelector<HTMLInputElement>('[data-testid="rule-title"]')
    const assignee = document.body.querySelector<HTMLSelectElement>('[data-testid="rule-assignee"]')
    if (!title || !assignee) throw new Error('fields missing')
    title.value = 'Fissare la chiamata'
    title.dispatchEvent(new Event('input'))
    await vi.waitFor(() => expect(assignee.querySelectorAll('option').length).toBe(2))
    assignee.value = 'u2'
    assignee.dispatchEvent(new Event('change'))
    await flushPromises()
    document.body.querySelector<HTMLFormElement>('#rule-form')?.requestSubmit()
    await vi.waitFor(() => expect(state.posts).toEqual([{ stageId: 'screen', enabled: true, action: { type: 'create_task', title: 'Fissare la chiamata', assignee: 'u2' } }]))
    await vi.waitFor(() => expect(wrapper.find('[data-rule-id="r9"] [data-testid="rule-sentence"]').text()).toBe("crea l'attività «Fissare la chiamata» per Bruno"))
  })

  it('pauses a rule and deletes it after confirmation', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-rule-id="r1"] [data-testid="rule-toggle"]').trigger('click')
    await vi.waitFor(() => expect(state.puts).toEqual([{ stageId: 'tech', enabled: false, action: { type: 'send_template', templateId: 't-update' } }]))
    await vi.waitFor(() => expect(wrapper.find('[data-rule-id="r1"] [data-testid="rule-toggle"]').attributes('aria-checked')).toBe('false'))
    expect(wrapper.find('[data-rule-id="r1"]').text()).toContain('In pausa')
    await wrapper.find('[data-rule-id="r1"] [data-testid="rule-delete"]').trigger('click')
    await vi.waitFor(() => expect(button('confirm')).not.toBeNull())
    button('confirm')?.click()
    await vi.waitFor(() => expect(state.deletes).toBe(1))
    await vi.waitFor(() => expect(wrapper.find('[data-rule-id="r1"]').exists()).toBe(false))
  })

  it('edits a rule with its values in the form', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-rule-id="r1"] [data-testid="rule-edit"]').trigger('click')
    await vi.waitFor(() => expect(button('rule-dialog')?.textContent).toContain('Modifica la regola: Colloquio tecnico'))
    await vi.waitFor(() => expect(document.body.querySelector<HTMLSelectElement>('[data-testid="rule-template"]')?.value).toBe('t-update'))
    document.body.querySelector<HTMLFormElement>('#rule-form')?.requestSubmit()
    await vi.waitFor(() => expect(state.puts).toEqual([{ stageId: 'tech', enabled: true, action: { type: 'send_template', templateId: 't-update' } }]))
  })
})
