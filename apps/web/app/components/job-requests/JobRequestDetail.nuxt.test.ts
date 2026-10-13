import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { jobRequest } from '~~/test/fixtures/job-request-fixtures'
import JobRequestDetail from './JobRequestDetail.vue'

const NOW = '2026-10-13T10:00:00.000Z'
const content = { title: 'Dev', language: 'it', salary: { currency: 'EUR', period: 'year' }, location: {}, process: [], summary: '', responsibilities: [], requirements: { mustHave: [], niceToHave: [] }, technologies: [], benefits: [], growth: '', workLifeBalance: '', culture: '' }
const job = { id: 'j1', slug: 'dev-abc', status: 'draft', content, quality: null, publishIssues: [], complianceWarnings: [], createdAt: NOW, updatedAt: NOW, publishedAt: null, closedAt: null }

const state = vi.hoisted(() => ({ calls: [] as { path: string; body: unknown }[], agent: false }))
const mock = (id: string, status: string) => {
  registerEndpoint(`/api/v1/job-requests/${id}`, () => ok(jobRequest(id, { status })))
  for (const action of ['approve', 'reject'] as const) {
    registerEndpoint(`/api/v1/job-requests/${id}/${action}`, {
      method: 'POST',
      handler: async (event) => {
        state.calls.push({ path: action, body: await readBody(event) })
        return ok(jobRequest(id, { status: action === 'approve' ? 'approved' : 'rejected', decidedAt: NOW, decidedBy: 'u1', decisionNote: 'ok' }))
      },
    })
  }
  registerEndpoint(`/api/v1/job-requests/${id}/convert`, { method: 'POST', handler: () => (state.calls.push({ path: 'convert', body: null }), ok(job)) })
}
mock('s1', 'submitted')
mock('a1', 'approved')
registerEndpoint('/api/v1/agent/status', () => ok({ enabled: state.agent, model: state.agent ? 'mistral/small' : null }))
mockNuxtImport('useAuthApi', () => () => ({
  getFullOrganization: async () => ({ id: 'o1', name: 'Acme', slug: 'acme', members: [{ id: 'm2', userId: 'u2', role: 'hiring_manager', name: 'Marta Neri', email: 'marta@example.com' }], invitations: [] }),
}))

const mounted: { unmount: () => void }[] = []
const byTestId = <T extends HTMLElement = HTMLElement>(testId: string) => document.body.querySelector<T>(`[data-testid="${testId}"]`)
const mountDetail = async (id: string) => {
  const wrapper = await mountSuspended(JobRequestDetail, { props: { id }, attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="request-detail"]').exists()).toBe(true))
  return wrapper
}
beforeEach(() => {
  state.calls.length = 0
  state.agent = false
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('job request detail', () => {
  it('shows every field and the requester', async () => {
    useViewer().viewer.value = viewerWith('recruiter')
    const wrapper = await mountDetail('s1')
    expect(wrapper.find('[data-testid="request-by"]').text()).toBe('Marta Neri')
    expect(wrapper.find('[data-testid="request-role"]').text()).toBe('Backend developer')
    expect(wrapper.find('[data-testid="request-budget"]').text()).toMatch(/45\.000.*60\.000/)
    expect(wrapper.find('[data-testid="request-workMode"]').text()).toBe('Ibrido')
    expect(wrapper.find('[data-testid="request-approve"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="request-waiting"]').exists()).toBe(true)
  })

  it('lets an approver approve with an optional note', async () => {
    useViewer().viewer.value = viewerWith('admin')
    const wrapper = await mountDetail('s1')
    await wrapper.find('[data-testid="request-approve"]').trigger('click')
    await vi.waitFor(() => expect(byTestId('decision-dialog')).not.toBeNull())
    byTestId('decision-confirm')!.click()
    await vi.waitFor(() => expect(state.calls).toEqual([{ path: 'approve', body: {} }]))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="request-status"]').text()).toBe('Approvata'))
  })

  it('requires a note to reject', async () => {
    useViewer().viewer.value = viewerWith('owner')
    const wrapper = await mountDetail('s1')
    await wrapper.find('[data-testid="request-reject"]').trigger('click')
    await vi.waitFor(() => expect(byTestId('decision-dialog')).not.toBeNull())
    byTestId('decision-confirm')!.click()
    await flushPromises()
    expect(document.body.textContent).toContain('Spiega il motivo del rifiuto')
    expect(state.calls).toHaveLength(0)
    const note = byTestId<HTMLTextAreaElement>('decision-note')!
    note.value = 'Fuori budget'
    note.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    byTestId('decision-confirm')!.click()
    await vi.waitFor(() => expect(state.calls).toEqual([{ path: 'reject', body: { note: 'Fuori budget' } }]))
  })

  it('converts an approved request and offers the assistant only when it is on', async () => {
    useViewer().viewer.value = viewerWith('recruiter')
    const off = await mountDetail('a1')
    expect(off.find('[data-testid="request-convert-assistant"]').exists()).toBe(false)
    state.agent = true
    clearNuxtData()
    const on = await mountDetail('a1')
    await vi.waitFor(() => expect(on.find('[data-testid="request-convert-assistant"]').exists()).toBe(true))
    await on.find('[data-testid="request-convert"]').trigger('click')
    await vi.waitFor(() => expect(state.calls).toEqual([{ path: 'convert', body: null }]))
  })
})
