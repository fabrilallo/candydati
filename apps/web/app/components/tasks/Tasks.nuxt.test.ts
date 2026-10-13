import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { task } from '~~/test/fixtures/phase4-fixtures'
import ApplicationTasks from './ApplicationTasks.vue'
import MyTasksPanel from './MyTasksPanel.vue'

const { api, state } = vi.hoisted(() => ({
  api: {
    getFullOrganization: async () => ({
      id: 'o1',
      name: 'Acme',
      slug: 'acme',
      members: [
        { id: 'm1', userId: 'u1', role: 'owner', name: 'Ada', email: 'ada@example.com' },
        { id: 'm2', userId: 'u2', role: 'recruiter', name: 'Bruno', email: 'bruno@example.com' },
      ],
      invitations: [],
    }),
  },
  state: { created: [] as unknown[], toggles: [] as string[] },
}))
mockNuxtImport('useAuthApi', () => () => api)

registerEndpoint('/api/v1/applications/a1/tasks', () => ok([task('t1', { assigneeId: 'u2', assigneeName: null })]))
registerEndpoint('/api/v1/tasks', async (event) => {
  if (event.method !== 'POST') return ok(mine)
  const body = await readBody<{ title: string; assigneeId: string }>(event)
  state.created.push(body)
  return ok(task('t9', { title: body.title, assigneeId: body.assigneeId, assigneeName: null, dueAt: null }))
})
registerEndpoint('/api/v1/tasks/t1/complete', { method: 'POST', handler: () => (state.toggles.push('complete'), ok(task('t1', { completedAt: '2026-10-13T11:00:00.000Z' }))) })
registerEndpoint('/api/v1/tasks/t1/reopen', { method: 'POST', handler: () => (state.toggles.push('reopen'), ok(task('t1'))) })

const mine = vi.hoisted(() => [] as ReturnType<typeof task>[])
mine.push(
  task('later', { title: 'Preparare la proposta', dueAt: '2026-10-20T16:00:00.000Z' }),
  task('none', { title: 'Aggiornare le note', dueAt: null, candidate: null, job: null, jobTitle: 'Data engineer' }),
  task('late', { title: 'Richiamare Giulia', dueAt: '2026-10-11T16:00:00.000Z' }),
  task('today', { title: 'Inviare il test', dueAt: '2026-10-13T16:00:00.000Z' }),
)

const mounted: { unmount: () => void }[] = []
beforeEach(() => {
  state.created.length = 0
  state.toggles.length = 0
  clearNuxtData()
  useState('tasks-now').value = Date.parse('2026-10-13T10:00:00.000Z')
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('tasks of an application', () => {
  it('lists the tasks with the assignee name from the members, and adds one', async () => {
    const wrapper = await mountSuspended(ApplicationTasks, { props: { applicationId: 'a1', jobId: 'j1' } })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="task-item"]').length).toBe(1))
    expect(wrapper.find('[data-testid="task-item"]').text()).toContain('Per Bruno')
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="task-assignee"] option').length).toBe(3))
    await wrapper.find('[data-testid="task-form"]').trigger('submit')
    expect(wrapper.text()).toContain("Scrivi cosa c'è da fare")
    expect(state.created).toEqual([])
    await wrapper.find('[data-testid="task-title"]').setValue('Chiamare per il feedback')
    await wrapper.find('[data-testid="task-assignee"]').setValue('u2')
    await wrapper.find('[data-testid="task-form"]').trigger('submit')
    await vi.waitFor(() => expect(state.created).toEqual([{ title: 'Chiamare per il feedback', assigneeId: 'u2', applicationId: 'a1', jobId: 'j1' }]))
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="task-item"]').length).toBe(2))
    expect((wrapper.find('[data-testid="task-title"]').element as HTMLInputElement).value).toBe('')
  })

  it('completes and reopens a task in place', async () => {
    const wrapper = await mountSuspended(ApplicationTasks, { props: { applicationId: 'a1', jobId: 'j1' } })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="task-toggle"]').exists()).toBe(true))
    await wrapper.find('[data-testid="task-toggle"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="task-item"]').attributes('data-done')).toBe('true'))
    expect(wrapper.find('[data-testid="task-toggle"]').attributes('aria-label')).toBe('Riapri: Chiamare per il feedback')
    await wrapper.find('[data-testid="task-toggle"]').trigger('click')
    await vi.waitFor(() => expect(state.toggles).toEqual(['complete', 'reopen']))
  })

  it('has no form for who cannot manage tasks', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = await mountSuspended(ApplicationTasks, { props: { applicationId: 'a1', jobId: 'j1' } })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="task-item"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="task-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="task-toggle"]').attributes('disabled')).toBeDefined()
  })
})

describe('my tasks', () => {
  it('groups by due date: overdue, today, upcoming, no due date', async () => {
    const wrapper = await mountSuspended(MyTasksPanel)
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.findAll('section').length).toBe(4))
    const groups = wrapper.findAll('section').map((section) => [section.attributes('data-group'), section.findAll('[data-testid="task-item"]').map((item) => item.attributes('data-task-id'))])
    expect(groups).toEqual([
      ['overdue', ['late']],
      ['today', ['today']],
      ['upcoming', ['later']],
      ['none', ['none']],
    ])
    expect(wrapper.find('h2').text()).toContain('Scadute')
    expect(wrapper.find('[data-task-id="late"] [data-testid="task-due"]').classes()).toContain('text-destructive')
    expect(wrapper.find('[data-task-id="late"]').text()).toContain('Giulia Rossi, Backend developer')
    expect(wrapper.find('[data-task-id="late"] a').attributes('href')).toBe('/app/candidates/c1?application=a1')
    expect(wrapper.find('[data-task-id="none"]').text()).toContain('Data engineer')
    await flushPromises()
  })
})
