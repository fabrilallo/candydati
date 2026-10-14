import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { viewerWith } from '~~/test/fixtures/job-fixtures'
import AcceptInvitation from './accept-invitation/[id].vue'
import Dashboard from './app/index.vue'
import CandidatePage from './app/candidates/[id].vue'
import JobRequestPage from './app/job-requests/[id].vue'

const mocks = vi.hoisted(() => ({
  api: { getInvitation: vi.fn(), acceptInvitation: vi.fn(), rejectInvitation: vi.fn(), getSession: vi.fn() },
  navigateTo: vi.fn(),
}))
mockNuxtImport('useAuthApi', () => () => mocks.api)
mockNuxtImport('navigateTo', () => mocks.navigateTo)

const invitation = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv1',
  email: 'ada@example.com',
  role: 'recruiter',
  status: 'pending',
  organizationName: 'Acme',
  inviterEmail: 'boss@example.com',
  ...overrides,
})

const stubs = { DashboardOverview: true, PrivacyMissingBanner: true, CandidateDetailView: true, JobRequestDetail: true }

beforeEach(() => {
  vi.clearAllMocks()
  clearNuxtData()
  mocks.api.getSession.mockResolvedValue(null)
  useViewer().viewer.value = viewerWith('owner')
})

describe('accept invitation page', () => {
  it('shows who invites, the role and accepts', async () => {
    mocks.api.getInvitation.mockResolvedValue(invitation())
    mocks.api.acceptInvitation.mockResolvedValue(undefined)
    const wrapper = await mountSuspended(AcceptInvitation, { route: '/accept-invitation/inv1' })
    expect(wrapper.find('h1').text()).toContain('Acme')
    expect(wrapper.text()).toContain('boss@example.com')
    await wrapper.findAll('button')[0]!.trigger('click')
    await flushPromises()
    expect(mocks.api.acceptInvitation).toHaveBeenCalledWith('inv1')
    expect(mocks.navigateTo).toHaveBeenCalledWith('/app')
  })

  it('rejects and goes to onboarding', async () => {
    mocks.api.getInvitation.mockResolvedValue(invitation())
    mocks.api.rejectInvitation.mockResolvedValue(undefined)
    const wrapper = await mountSuspended(AcceptInvitation, { route: '/accept-invitation/inv1' })
    await wrapper.findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(mocks.api.rejectInvitation).toHaveBeenCalledWith('inv1')
    expect(mocks.navigateTo).toHaveBeenCalledWith('/onboarding')
  })

  it('shows the error and stays when accepting fails', async () => {
    mocks.api.getInvitation.mockResolvedValue(invitation())
    mocks.api.acceptInvitation.mockRejectedValue(new Error('boom'))
    const wrapper = await mountSuspended(AcceptInvitation, { route: '/accept-invitation/inv1' })
    await wrapper.findAll('button')[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(mocks.navigateTo).not.toHaveBeenCalled()
  })

  it('offers no buttons when the invitation is not pending', async () => {
    mocks.api.getInvitation.mockResolvedValue(invitation({ status: 'accepted' }))
    const wrapper = await mountSuspended(AcceptInvitation, { route: '/accept-invitation/inv1' })
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.text()).toContain('accepted')
  })

  it('explains when the invitation cannot be loaded', async () => {
    mocks.api.getInvitation.mockRejectedValue(new Error('gone'))
    const wrapper = await mountSuspended(AcceptInvitation, { route: '/accept-invitation/inv1' })
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/app"]').exists()).toBe(true)
  })
})

describe('dashboard page', () => {
  it('welcomes the person and offers the actions their role allows', async () => {
    const wrapper = await mountSuspended(Dashboard, { route: '/app', global: { stubs } })
    expect(wrapper.find('h1').exists()).toBe(true)
    expect(wrapper.find('a[href="/app/jobs/new"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/app/settings/members"]').exists()).toBe(true)
    expect(wrapper.find('a[href^="/careers/"]').exists()).toBe(true)
  })

  it('hides creation for a role that cannot create jobs', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = await mountSuspended(Dashboard, { route: '/app', global: { stubs } })
    expect(wrapper.find('a[href="/app/jobs/new"]').exists()).toBe(false)
  })
})

describe('candidate page', () => {
  it('shows the detail with the application named in the link and the export action', async () => {
    const wrapper = await mountSuspended(CandidatePage, { route: '/app/candidates/c1?application=a1&viaJobId=j1', global: { stubs } })
    const detail = wrapper.findComponent({ name: 'CandidateDetailView' })
    expect(detail.props()).toMatchObject({ candidateId: 'c1', applicationId: 'a1', viaJobId: 'j1' })
    expect(wrapper.find('[data-testid="topbar-export"]').attributes('href')).toContain('c1')
  })

  it('goes back to the list when the candidate was erased', async () => {
    const wrapper = await mountSuspended(CandidatePage, { route: '/app/candidates/c1', global: { stubs } })
    wrapper.findComponent({ name: 'CandidateDetailView' }).vm.$emit('erased', true)
    await flushPromises()
    expect(mocks.navigateTo).toHaveBeenCalledWith('/app/candidates', { replace: true })
  })

  it('stays when only one application was erased', async () => {
    const wrapper = await mountSuspended(CandidatePage, { route: '/app/candidates/c1', global: { stubs } })
    wrapper.findComponent({ name: 'CandidateDetailView' }).vm.$emit('erased', false)
    await flushPromises()
    expect(mocks.navigateTo).not.toHaveBeenCalled()
  })
})

describe('job request page', () => {
  it('passes the id of the route to the detail', async () => {
    const wrapper = await mountSuspended(JobRequestPage, { route: '/app/job-requests/r1', global: { stubs } })
    expect(wrapper.findComponent({ name: 'JobRequestDetail' }).props('id')).toBe('r1')
  })
})
