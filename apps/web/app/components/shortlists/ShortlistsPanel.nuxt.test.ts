import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { card, detail, note, pipeline } from '~~/test/fixtures/candidate-fixtures'
import { client, shortlist } from '~~/test/fixtures/client-fixtures'
import { makeJob, ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import ShortlistsPanel from './ShortlistsPanel.vue'

const state = vi.hoisted(() => ({
  display: 'named',
  shortlists: [] as unknown[],
  posts: [] as unknown[],
  refuse: null as null | { status: number; code: string; issues?: unknown[] },
  revoked: [] as string[],
}))
registerEndpoint('/api/v1/settings/agency', () => ok({ recruitsForClients: true, agencyAuthorization: 'Aut. 1' }))
registerEndpoint('/api/v1/clients', () => ok([client()]))
registerEndpoint('/api/v1/jobs/j1/client', () => ok({ jobId: 'j1', client: { id: 'c1', name: 'Acme Spa', archived: false }, display: state.display }))
registerEndpoint('/api/v1/jobs/j1/pipeline', () =>
  ok(pipeline([card('a1'), card('a2', 'stage-0', { hasCv: false }), card('a3', 'stage-1', { outcome: 'hired' }), card('a4', 'received', { consentStatus: 'to_renew' })])),
)
registerEndpoint('/api/v1/candidates/c-a1', () => ok(detail({ notes: [note('n1'), note('n2', { applicationId: null, body: 'Disponibile da gennaio.' }), note('n3', { applicationId: 'other' })] })))
registerEndpoint('/api/v1/candidates/c-a2', () => ok(detail({ notes: [] })))
registerEndpoint('/api/v1/jobs/j1/shortlists', { method: 'GET', handler: () => ok(state.shortlists) })
registerEndpoint('/api/v1/jobs/j1/shortlists', {
  method: 'POST',
  handler: async (event) => {
    state.posts.push(await readBody(event))
    if (state.refuse) {
      setResponseStatus(event, state.refuse.status)
      return { success: false, data: null, error: { code: state.refuse.code, message: 'x', issues: state.refuse.issues ?? [] } }
    }
    state.shortlists = [shortlist({ id: 's2' })]
    return ok(shortlist({ id: 's2' }))
  },
})
registerEndpoint('/api/v1/shortlists/s1/revoke', {
  method: 'POST',
  handler: () => {
    state.revoked.push('s1')
    state.shortlists = [shortlist({ status: 'revoked', revokedAt: '2026-10-14T10:00:00.000Z' })]
    return ok(state.shortlists[0])
  },
})

const mounted: { unmount: () => void }[] = []
const byTestId = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const mountPanel = async (job = makeJob({ status: 'published' })) => {
  const wrapper = await mountSuspended(ShortlistsPanel, { props: { job }, attachTo: document.body })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}
const compose = async (wrapper: Awaited<ReturnType<typeof mountPanel>>) => {
  await vi.waitFor(() => expect(wrapper.find('[data-testid="shortlist-new"]').exists()).toBe(true))
  await wrapper.find('[data-testid="shortlist-new"]').trigger('click')
  await vi.waitFor(() => expect(wrapper.findAll('[data-testid="shortlist-candidate"]')).toHaveLength(2))
}

beforeEach(() => {
  state.display = 'named'
  state.shortlists = [shortlist()]
  state.posts = []
  state.refuse = null
  state.revoked = []
  clearNuxtData()
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('shortlists of a client job', () => {
  it('lists what was sent with each answer and its reason', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="shortlist-card"]').exists()).toBe(true))
    const card = wrapper.find('[data-testid="shortlist-card"]')
    expect(card.text()).toContain('A Rita Verdi (rita@acme.example)')
    expect(card.find('[data-testid="shortlist-status"]').text()).toBe('Aperta')
    expect(card.findAll('[data-testid="shortlist-answer"]').map((node) => node.text())).toEqual(['Incontriamolo al colloquio'])
    expect(card.find('[data-testid="shortlist-reason"]').text()).toContain('Profilo solido')
    expect(card.text()).toContain('nome, CV, 1 nota')
    expect(card.text()).toContain('In attesa di risposta')
  })

  it('offers only presentable candidates, the CV only when there is one, and notes about this application', async () => {
    const wrapper = await mountPanel()
    await compose(wrapper)
    expect(wrapper.findAll('[data-testid="shortlist-candidate"]').map((node) => node.text())).toEqual([expect.stringContaining('Rossi a1'), expect.stringContaining('Rossi a2')])
    await wrapper.find('[data-testid="shortlist-a2-pick"]').setValue(true)
    expect(wrapper.find('[data-testid="shortlist-a2-cv"]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-testid="shortlist-a1-pick"]').setValue(true)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="shortlist-a1-note"]')).toHaveLength(2))
    expect(wrapper.text()).toContain('Disponibile da gennaio.')
  })

  it('confirms what goes out and that candidates are told, then sends', async () => {
    const wrapper = await mountPanel()
    await compose(wrapper)
    await wrapper.find('[data-testid="shortlist-a1-pick"]').setValue(true)
    await wrapper.find('[data-testid="shortlist-a1-cv"]').setValue(true)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="shortlist-a1-note"]')).toHaveLength(2))
    await wrapper.find('[data-testid="shortlist-a1-note"] input').setValue(true)
    await wrapper.find('[data-testid="shortlist-message"]').setValue('  Ecco i profili  ')
    await wrapper.find('[data-testid="shortlist-composer"]').trigger('submit')
    await flushPromises()
    expect(byTestId('shortlist-confirm-recipient')?.textContent).toContain('Rita Verdi di Acme Spa')
    expect(byTestId('shortlist-confirm-line')?.textContent).toContain('nome, CV, 1 nota')
    expect(byTestId('shortlist-confirm-notice')?.textContent).toContain('presentato a Acme Spa')
    expect(state.posts).toEqual([])
    byTestId('shortlist-send')?.click()
    await vi.waitFor(() => expect(state.posts).toEqual([{ contactId: 'k1', message: 'Ecco i profili', candidates: [{ applicationId: 'a1', shareCv: true, noteIds: ['n1'] }] }]))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="shortlist-composer"]').exists()).toBe(false))
  })

  it('tells candidates of a confidential job only that a client of the agency saw them', async () => {
    state.display = 'confidential'
    const wrapper = await mountPanel()
    await compose(wrapper)
    await wrapper.find('[data-testid="shortlist-a1-pick"]').setValue(true)
    await wrapper.find('[data-testid="shortlist-composer"]').trigger('submit')
    await flushPromises()
    const notice = byTestId('shortlist-confirm-notice')?.textContent ?? ''
    expect(notice).toContain('un cliente dell\'agenzia che ha chiesto riservatezza')
    expect(notice).not.toContain('Acme')
  })

  it('asks for a candidate before the confirm step, and names a candidate the api refused', async () => {
    state.refuse = { status: 422, code: 'validation_failed', issues: [{ path: 'candidates.0.applicationId', message: 'not_presentable' }] }
    const wrapper = await mountPanel()
    await compose(wrapper)
    await wrapper.find('[data-testid="shortlist-composer"]').trigger('submit')
    expect(wrapper.find('[data-testid="shortlist-checks"]').text()).toContain('Scegli almeno un candidato')
    await wrapper.find('[data-testid="shortlist-a1-pick"]').setValue(true)
    await wrapper.find('[data-testid="shortlist-composer"]').trigger('submit')
    await flushPromises()
    byTestId('shortlist-send')?.click()
    await vi.waitFor(() => expect(byTestId('shortlist-confirm-errors')?.textContent).toContain('Giulia Rossi a1: la candidatura è chiusa o senza consenso.'))
  })

  it('revokes an open link after confirming', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="shortlist-revoke"]').exists()).toBe(true))
    await wrapper.find('[data-testid="shortlist-revoke"]').trigger('click')
    await flushPromises()
    byTestId('confirm')?.click()
    await vi.waitFor(() => expect(state.revoked).toEqual(['s1']))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="shortlist-status"]').text()).toBe('Revocata'))
  })

  it('lets a hiring manager read but not send or revoke, and says when a closed ad cannot get new ones', async () => {
    useViewer().viewer.value = viewerWith('hiring_manager')
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="shortlist-card"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="shortlist-new"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="shortlist-revoke"]').exists()).toBe(false)
    useViewer().viewer.value = viewerWith('recruiter')
    const closed = await mountPanel(makeJob({ status: 'closed' }))
    await vi.waitFor(() => expect(closed.find('[data-testid="shortlists-blocked"]').exists()).toBe(true))
    expect(closed.find('[data-testid="shortlist-new"]').exists()).toBe(false)
  })
})
