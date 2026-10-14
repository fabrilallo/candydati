import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeJob, ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import JobEditorPage from './app/jobs/[id]/index.vue'
import JobCandidatesPage from './app/jobs/[id]/candidates.vue'
import JobsIndex from './app/jobs/index.vue'
import NewJobPage from './app/jobs/new.vue'
import MembersPage from './app/settings/members.vue'
import PrivacyPage from './app/settings/privacy.vue'

const mocks = vi.hoisted(() => ({
  org: {
    getFullOrganization: vi.fn(),
    cancelInvitation: vi.fn(),
  },
  state: { job: 'ok' as 'ok' | 'missing' | 'down' },
}))
mockNuxtImport('useAuthApi', () => () => mocks.org)

const stubs = {
  JobEditor: { props: ['job', 'template'], template: '<div data-testid="job-editor-stub">{{ job ? job.content.title : "new" }}</div>' },
  PipelinePanel: { props: ['jobId'], template: '<div data-testid="pipeline-stub">{{ jobId }}</div>' },
  JobsPanel: true,
  NewJobMenu: true,
  PrivacySettings: { template: '<div data-testid="privacy-settings-stub" />' },
  RetentionOverview: { template: '<div data-testid="retention-stub" />' },
  PrivacyDocuments: { template: '<div data-testid="documents-stub" />' },
  MembersTable: true,
  PendingInvitations: { props: ['invitations'], emits: ['cancel'], template: '<button data-testid="cancel-stub" @click="$emit(\'cancel\', \'inv1\')">cancel</button>' },
  InviteForm: true,
  AccessSetting: true,
}

registerEndpoint('/api/v1/jobs/j1', (event) => {
  if (mocks.state.job === 'missing') {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: { code: 'not_found', message: 'x' } }
  }
  if (mocks.state.job === 'down') {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: { code: 'internal', message: 'x' } }
  }
  return ok(makeJob({ status: 'published', publishedAt: '2026-10-13T10:00:00.000Z' }))
})

const mounted: { unmount: () => void }[] = []
const mountPage = async (component: Parameters<typeof mountSuspended>[0], route: string) => {
  const wrapper = await mountSuspended(component, { route, global: { stubs }, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.job = 'ok'
  clearNuxtData()
  useViewer().viewer.value = viewerWith('recruiter')
  mocks.org.getFullOrganization.mockResolvedValue({ id: 'o1', name: 'Acme', slug: 'acme', members: [{ id: 'm1', userId: 'u1', role: 'owner', name: 'Ada', email: 'ada@example.com' }], invitations: [{ id: 'inv1', email: 'x@example.com', role: 'recruiter', status: 'pending' }] })
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('job editor page', () => {
  it('opens the editor with the loaded job', async () => {
    const wrapper = await mountPage(JobEditorPage, '/app/jobs/j1')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="job-editor-stub"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="job-editor-stub"]').text()).toBe('Backend developer')
  })

  it('shows a not found state for a job that does not exist', async () => {
    mocks.state.job = 'missing'
    const wrapper = await mountPage(JobEditorPage, '/app/jobs/j1')
    expect(wrapper.find('[data-testid="job-editor-stub"]').exists()).toBe(false)
    expect(wrapper.text()).not.toBe('')
  })

  it('shows the load error with a way back when the api fails', async () => {
    mocks.state.job = 'down'
    const wrapper = await mountPage(JobEditorPage, '/app/jobs/j1')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/app/jobs"]').exists()).toBe(true)
  })
})

describe('job pipeline page', () => {
  it('shows the pipeline with the public link of a published job', async () => {
    const wrapper = await mountPage(JobCandidatesPage, '/app/jobs/j1/candidates')
    expect(wrapper.find('[data-testid="pipeline-stub"]').text()).toBe('j1')
    await vi.waitFor(() => expect(wrapper.find('a[href^="/careers/acme/"]').exists()).toBe(true))
  })
})

describe('jobs list and new job pages', () => {
  it('shows the list and the new job menu to a recruiter', async () => {
    const wrapper = await mountPage(JobsIndex, '/app/jobs')
    expect(wrapper.findComponent({ name: 'JobsPanel' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'NewJobMenu' }).exists()).toBe(true)
    expect(wrapper.find('a[href="/app/jobs/templates"]').exists()).toBe(true)
  })

  it('opens an empty editor for a new job', async () => {
    const wrapper = await mountPage(NewJobPage, '/app/jobs/new')
    expect(wrapper.find('[data-testid="job-editor-stub"]').text()).toBe('new')
  })

  it('says a role that cannot create jobs may not', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = await mountPage(NewJobPage, '/app/jobs/new')
    expect(wrapper.find('[data-testid="job-editor-stub"]').exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })
})

describe('members settings page', () => {
  it('lists members and pending invitations, and cancels one', async () => {
    useViewer().viewer.value = viewerWith('owner')
    mocks.org.cancelInvitation.mockResolvedValue(undefined)
    const wrapper = await mountPage(MembersPage, '/app/settings/members')
    await vi.waitFor(() => expect(wrapper.find('#members-title').exists()).toBe(true))
    await wrapper.find('[data-testid="cancel-stub"]').trigger('click')
    await flushPromises()
    expect(mocks.org.cancelInvitation).toHaveBeenCalledWith('inv1')
    expect(mocks.org.getFullOrganization).toHaveBeenCalledTimes(2)
  })

  it('shows the load error with a retry', async () => {
    mocks.org.getFullOrganization.mockRejectedValue(new Error('down'))
    const wrapper = await mountPage(MembersPage, '/app/settings/members')
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    mocks.org.getFullOrganization.mockResolvedValue({ id: 'o1', name: 'Acme', slug: 'acme', members: [], invitations: [] })
    await wrapper.findAll('button').find((button) => button.text() === 'Riprova')?.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#members-title').exists()).toBe(true))
  })

  it('keeps the invitations list from a role that cannot manage them', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = await mountPage(MembersPage, '/app/settings/members')
    await vi.waitFor(() => expect(wrapper.find('#members-title').exists()).toBe(true))
    expect(wrapper.find('#pending-title').exists()).toBe(false)
  })
})

describe('privacy settings page', () => {
  it('opens the notice tab first and switches to retention and documents', async () => {
    useViewer().viewer.value = viewerWith('owner')
    const wrapper = await mountPage(PrivacyPage, '/app/settings/privacy')
    expect(wrapper.find('[data-testid="privacy-settings-stub"]').exists()).toBe(true)
    await wrapper.find('[data-testid="privacy-tab-retention"]').trigger('click')
    expect(wrapper.find('[data-testid="retention-stub"]').exists()).toBe(true)
    await wrapper.find('[data-testid="privacy-tab-documents"]').trigger('click')
    expect(wrapper.find('[data-testid="documents-stub"]').exists()).toBe(true)
  })

  it('opens the tab named in the link', async () => {
    useViewer().viewer.value = viewerWith('owner')
    const wrapper = await mountPage(PrivacyPage, '/app/settings/privacy?tab=retention')
    expect(wrapper.find('[data-testid="retention-stub"]').exists()).toBe(true)
  })

  it('refuses a role without privacy rights', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = await mountPage(PrivacyPage, '/app/settings/privacy')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="privacy-settings-stub"]').exists()).toBe(false)
  })
})
