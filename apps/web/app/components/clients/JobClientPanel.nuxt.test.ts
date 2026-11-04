import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { client } from '~~/test/fixtures/client-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import JobClientPanel from './JobClientPanel.vue'

const state = vi.hoisted(() => ({ on: true, link: { jobId: 'j1', client: null as unknown, display: 'named' }, puts: [] as unknown[], calls: [] as string[] }))
registerEndpoint('/api/v1/settings/agency', () => ok({ recruitsForClients: state.on, agencyAuthorization: null }))
registerEndpoint('/api/v1/clients', () => {
  state.calls.push('clients')
  return ok([client(), client({ id: 'c2', name: 'Beta', archived: true })])
})
registerEndpoint('/api/v1/jobs/j1/client', {
  method: 'GET',
  handler: () => {
    state.calls.push('job-client')
    return ok(state.link)
  },
})
registerEndpoint('/api/v1/jobs/j1/client', {
  method: 'PUT',
  handler: async (event) => {
    const body = await readBody<{ clientId: string | null; display: string }>(event)
    state.puts.push(body)
    return ok({ jobId: 'j1', client: body.clientId ? { id: body.clientId, name: 'Acme Spa', archived: false } : null, display: body.display })
  },
})

const mounted: { unmount: () => void }[] = []
const mountPanel = async (readOnly = false) => {
  const wrapper = await mountSuspended(JobClientPanel, { props: { jobId: 'j1', readOnly } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  state.on = true
  state.link = { jobId: 'j1', client: null, display: 'named' }
  state.puts = []
  state.calls = []
  clearNuxtData()
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('client of a job', () => {
  it('shows nothing and asks nothing when the organization does not recruit for clients', async () => {
    state.on = false
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="job-client"]').exists()).toBe(false)
    expect(state.calls).toEqual([])
  })

  it('offers active clients only, explains what candidates see and saves the choice', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="job-client-select"]').exists()).toBe(true))
    expect(wrapper.findAll('option').map((option) => option.text())).toEqual(['Nessun cliente (posizione nostra)', 'Acme Spa'])
    expect(wrapper.find('[data-testid="job-client-explain"]').text()).toContain('solo la vostra organizzazione')
    await wrapper.find('[data-testid="job-client-select"]').setValue('c1')
    expect(wrapper.find('[data-testid="job-client-explain"]').text()).toContain('"per Acme Spa"')
    await wrapper.find('[role="radiogroup"] button:last-child').trigger('click')
    expect(wrapper.find('[data-testid="job-client-explain"]').text()).toContain('cliente riservato')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(state.puts).toEqual([{ clientId: 'c1', display: 'confidential' }]))
  })

  it('is read-only for who does not manage clients (a hiring manager can edit the ad, not reveal its client)', async () => {
    useViewer().viewer.value = viewerWith('hiring_manager')
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="job-client-select"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="job-client-select"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="job-client-save"]').exists()).toBe(false)
  })

  it('keeps an archived current client visible, and is read-only when the ad cannot be edited', async () => {
    state.link = { jobId: 'j1', client: { id: 'c2', name: 'Beta', archived: true }, display: 'named' }
    const wrapper = await mountPanel(true)
    await vi.waitFor(() => expect(wrapper.findAll('option').map((option) => option.text())).toContain('Beta (archiviato)'))
    expect(wrapper.find('[data-testid="job-client-select"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="job-client-save"]').exists()).toBe(false)
  })
})
