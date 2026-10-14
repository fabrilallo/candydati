import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeJob, ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import JobTeamPanel from './JobTeamPanel.vue'

const { api, state } = vi.hoisted(() => ({
  api: {
    getFullOrganization: async () => ({
      id: 'o1',
      name: 'Acme',
      slug: 'acme',
      members: [
        { id: 'm1', userId: 'u1', role: 'recruiter', name: 'Anna Bianchi', email: 'anna@example.com' },
        { id: 'm2', userId: 'u2', role: 'interviewer', name: 'Bruno Neri', email: 'bruno@example.com' },
        { id: 'm3', userId: 'u3', role: 'hiring_manager', name: 'Carla Verdi', email: 'carla@example.com' },
      ],
      invitations: [],
    }),
  },
  state: { puts: [] as unknown[], deletes: [] as string[] },
}))
mockNuxtImport('useAuthApi', () => () => api)

const member = (userId: string, name: string, overrides = {}) => ({ userId, name, email: `${userId}@example.com`, role: 'recruiter', source: 'team', stageIds: [], removable: true, addedAt: null, ...overrides })
const TEAM = { jobId: 'j1', members: [member('u1', 'Anna Bianchi'), member('u2', 'Bruno Neri', { role: 'interviewer', source: 'stage_interviewer', stageIds: ['stage-0'], removable: false })] }
const job = makeJob({ content: { ...makeJob().content, process: [{ id: 'stage-0', type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' }] } })

registerEndpoint('/api/v1/jobs/j1/team', () => ok(TEAM))
registerEndpoint('/api/v1/jobs/j1/team/u3', async (event) => {
  state.puts.push({ user: 'u3', body: await readBody(event) })
  return ok({ jobId: 'j1', members: [...TEAM.members, member('u3', 'Carla Verdi', { role: 'hiring_manager' })] })
})
registerEndpoint('/api/v1/jobs/j1/team/u1', async (event) => {
  if (event.method === 'DELETE') {
    state.deletes.push('u1')
    return ok({ removed: true })
  }
  state.puts.push({ user: 'u1', body: await readBody(event) })
  return ok(TEAM)
})

const mounted: { unmount: () => void }[] = []
const mountIt = async () => {
  const wrapper = await mountSuspended(JobTeamPanel, { props: { job }, attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.findAll('[data-testid="team-member-row"]').length).toBeGreaterThan(0))
  return wrapper
}
beforeEach(() => {
  state.puts.length = 0
  state.deletes.length = 0
  clearNuxtData('job-team-j1')
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('JobTeamPanel', () => {
  it('lists the team; stage interviewers show their stage and cannot be removed here', async () => {
    const wrapper = await mountIt()
    const rows = wrapper.findAll('[data-testid="team-member-row"]')
    expect(rows.map((row) => row.text())).toEqual([expect.stringContaining('Anna Bianchi'), expect.stringContaining('Bruno Neri')])
    expect(rows[1]?.text()).toContain('Chiamata conoscitiva')
    expect(rows[0]?.find('[data-testid="team-remove"]').exists()).toBe(true)
    expect(rows[1]?.find('[data-testid="team-remove"]').exists()).toBe(false)
  })

  it('adds a member of the organization with a role, offering only who is not on the team', async () => {
    const wrapper = await mountIt()
    const options = wrapper.findAll('[data-testid="team-member-select"] option').map((option) => option.text())
    expect(options).toEqual([expect.any(String), 'Bruno Neri', 'Carla Verdi'])
    await wrapper.find('[data-testid="team-member-select"]').setValue('u3')
    await wrapper.find('[data-testid="team-role-select"]').setValue('hiring_manager')
    await wrapper.find('[data-testid="team-add-member"]').trigger('submit')
    await flushPromises()
    expect(state.puts).toEqual([{ user: 'u3', body: { role: 'hiring_manager' } }])
    await vi.waitFor(() => expect(wrapper.text()).toContain('Carla Verdi'))
  })

  it('removes a member', async () => {
    const wrapper = await mountIt()
    await wrapper.find('[data-testid="team-remove"]').trigger('click')
    await flushPromises()
    expect(state.deletes).toEqual(['u1'])
  })

  it('shows the team read-only to whoever cannot manage it', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = await mountIt()
    expect(wrapper.find('[data-testid="team-add-member"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="team-remove"]').exists()).toBe(false)
  })
})
