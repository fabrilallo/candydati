import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detail } from '~~/test/fixtures/candidate-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import CandidateDetailView from '../candidate/CandidateDetailView.vue'

const state = vi.hoisted(() => ({ calls: [] as { what: string; body: unknown }[], value: null as unknown, emailTaken: false }))
registerEndpoint('/api/v1/candidates/c1', { method: 'GET', handler: () => ok(state.value) })
registerEndpoint('/api/v1/candidates/c1/details', {
  method: 'PATCH',
  handler: async (event) => {
    const body = await readBody<Record<string, string>>(event)
    state.calls.push({ what: 'correct', body })
    if (state.emailTaken) {
      setResponseStatus(event, 409)
      return { success: false, data: null, error: { code: 'conflict', message: 'email taken' } }
    }
    return ok(detail({ candidate: { ...detail().candidate, ...body } }))
  },
})
registerEndpoint('/api/v1/applications/a1/withdraw-consent', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<{ scope: string }>(event)
    state.calls.push({ what: 'withdraw', body })
    return body.scope === 'talent_pool' ? ok(detail({ candidate: { ...detail().candidate, talentPool: false } })) : ok({ erased: true })
  },
})
registerEndpoint('/api/v1/candidates/c1/erase', {
  method: 'POST',
  handler: async (event) => {
    state.calls.push({ what: 'erase', body: await readBody(event) })
    return ok({ erased: true })
  },
})

const mounted: { unmount: () => void }[] = []
const dialog = () => document.body.querySelector('[role="dialog"]')
const mountPrivacy = async () => {
  const wrapper = await mountSuspended(CandidateDetailView, { props: { candidateId: 'c1' }, attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="tab-privacy"]').exists()).toBe(true))
  await wrapper.find('[data-testid="tab-privacy"]').trigger('click')
  await flushPromises()
  return wrapper
}
const type = async (selector: string, value: string) => {
  const input = document.body.querySelector<HTMLInputElement>(selector)
  if (!input) throw new Error(`missing ${selector}`)
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

beforeEach(() => {
  state.calls.length = 0
  state.emailTaken = false
  state.value = detail({ applications: detail().applications.map((app) => ({ ...app, retentionExpiresAt: '2026-10-25T10:00:00.000Z' })) })
  clearNuxtData('candidate-c1')
  useState('candidate-now').value = new Date('2026-10-13T10:00:00.000Z').getTime()
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('Privacy e dati', () => {
  it('shows consent per application with the days left, and the four rights', async () => {
    const wrapper = await mountPrivacy()
    const item = wrapper.find('[data-testid="consent-item"]')
    expect(item.text()).toContain('Informativa versione 3')
    expect(item.text()).toContain('Questa selezione')
    expect(item.text()).toContain('Database candidati')
    expect(item.find('[data-testid="consent-retention"]').text()).toContain('tra 12 giorni')
    expect(wrapper.find('[data-testid="export-zip"]').attributes('href')).toBe('/api/v1/candidates/c1/export')
    for (const right of ['export', 'correct', 'withdraw', 'erase']) expect(wrapper.find(`[data-testid="right-${right}"]`).exists()).toBe(true)
  })

  it('is hidden without any of the rights, and shows only what the role may do', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = await mountSuspended(CandidateDetailView, { props: { candidateId: 'c1' } })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="candidate-name"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="tab-privacy"]').exists()).toBe(false)

    useViewer().viewer.value = viewerWith('hiring_manager')
    const limited = await mountPrivacy()
    expect(limited.find('[data-testid="right-correct"]').exists()).toBe(true)
    expect(limited.find('[data-testid="right-export"]').exists()).toBe(false)
    expect(limited.find('[data-testid="right-erase"]').exists()).toBe(false)
    // Withdrawing selection consent erases the application: hidden without candidate:erase.
    expect(limited.find('[data-testid="withdraw-selection"]').exists()).toBe(false)
  })

  it('sends only the corrected fields and shows an email conflict on the field', async () => {
    state.emailTaken = true
    const wrapper = await mountPrivacy()
    await wrapper.find('[data-testid="correct-open"]').trigger('click')
    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    await type('[data-testid="correct-email"]', 'altra@example.com')
    document.body.querySelector<HTMLButtonElement>('[data-testid="correct-save"]')?.click()
    await vi.waitFor(() => expect(document.body.querySelector('#correct-email-error')?.textContent).toBe('Questa email appartiene già a un altro candidato'))
    expect(state.calls).toEqual([{ what: 'correct', body: { email: 'altra@example.com' } }])

    state.emailTaken = false
    await type('[data-testid="correct-firstName"]', 'Giulietta')
    document.body.querySelector<HTMLButtonElement>('[data-testid="correct-save"]')?.click()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="candidate-name"]').text()).toBe('Giulietta Rossi'))
  })

  it('explains the consequence before withdrawing the talent pool consent', async () => {
    const wrapper = await mountPrivacy()
    await wrapper.find('[data-testid="withdraw-talent_pool"]').trigger('click')
    await vi.waitFor(() => expect(dialog()?.textContent).toContain('Giulia Rossi esce dal database candidati'))
    document.body.querySelector<HTMLButtonElement>('[data-testid="confirm"]')?.click()
    await vi.waitFor(() => expect(state.calls).toEqual([{ what: 'withdraw', body: { scope: 'talent_pool' } }]))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="withdraw-talent_pool"]').exists()).toBe(false))
  })

  it('withdrawing the selection consent of the only application erases the candidate', async () => {
    const wrapper = await mountPrivacy()
    await wrapper.find('[data-testid="withdraw-selection"]').trigger('click')
    await vi.waitFor(() => expect(dialog()?.textContent).toContain("Era l'unica"))
    document.body.querySelector<HTMLButtonElement>('[data-testid="confirm"]')?.click()
    await vi.waitFor(() => expect(wrapper.emitted('erased')).toEqual([[true]]))
  })

  it('erases only after the full name is typed, listing what goes and what stays', async () => {
    const wrapper = await mountPrivacy()
    await wrapper.find('[data-testid="erase-open"]').trigger('click')
    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    const deleted = document.body.querySelector('[data-testid="erase-deleted"]')?.textContent ?? ''
    for (const word of ['profilo', 'candidature', 'CV', 'note', 'messaggi', 'attività']) expect(deleted.toLowerCase()).toContain(word.toLowerCase())
    expect(document.body.querySelector('[data-testid="erase-kept"]')?.textContent).toContain('senza dati personali')
    const confirm = () => document.body.querySelector<HTMLButtonElement>('[data-testid="erase-confirm"]')
    expect(confirm()?.disabled).toBe(true)
    await type('[data-testid="erase-name"]', 'Giulia')
    expect(confirm()?.disabled).toBe(true)
    await type('[data-testid="erase-name"]', ' giulia  rossi ')
    expect(confirm()?.disabled).toBe(false)
    confirm()?.click()
    await vi.waitFor(() => expect(state.calls).toEqual([{ what: 'erase', body: { confirmName: 'Giulia Rossi' } }]))
    await vi.waitFor(() => expect(wrapper.emitted('erased')).toEqual([[true]]))
  })

  it('erasing one application of a single-application candidate says the profile goes too', async () => {
    const wrapper = await mountPrivacy()
    await wrapper.find('[data-testid="erase-application"]').trigger('click')
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="erase-last"]')?.textContent).toContain('anche il profilo'))
  })
})
