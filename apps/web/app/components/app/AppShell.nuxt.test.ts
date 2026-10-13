import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { viewerWith } from '~~/test/fixtures/job-fixtures'
import { jobStatsFixture } from '~~/test/fixtures/job-stats'
import AppNavPanel from './AppNavPanel.vue'
import AppRail from './AppRail.vue'
import AppTopBar from './AppTopBar.vue'

registerEndpoint('/api/v1/stats/jobs', () => ({ success: true, data: jobStatsFixture(), error: null }))

const mounted: { unmount: () => void }[] = []
const track = <T extends { unmount: () => void }>(wrapper: T): T => (mounted.push(wrapper), wrapper)

beforeEach(() => {
  clearNuxtData('job-stats')
  window.localStorage.clear()
  useNavPanel().panelOpen.value = true
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('AppNavPanel', () => {
  it('groups the entries the role may see under headings, with the published count on job ads', async () => {
    useViewer().viewer.value = viewerWith('owner')
    const wrapper = track(await mountSuspended(AppNavPanel))
    expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual(['Selezione', 'Organizzazione'])
    await vi.waitFor(() => expect(wrapper.find('[data-testid="nav-count-jobs"]').text()).toContain('3'))
    expect(wrapper.find('[data-testid="nav-count-jobs"]').text()).toContain('3 pubblicati')
  })

  it('hides what the role cannot open and never asks for job stats without job:read', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = track(await mountSuspended(AppNavPanel))
    const links = wrapper.findAll('nav a').map((link) => link.attributes('href'))
    expect(links).not.toContain('/app/settings/audit-log')
    expect(links).not.toContain('/app/jobs/templates')
  })

  it('carries language, theme and the user menu inside the mobile drawer only', async () => {
    useViewer().viewer.value = viewerWith('owner')
    const desktop = track(await mountSuspended(AppNavPanel))
    expect(desktop.find('[aria-label="Lingua"]').exists()).toBe(false)
    const drawer = track(await mountSuspended(AppNavPanel, { props: { inDrawer: true } }))
    expect(drawer.find('[aria-label="Lingua"]').exists()).toBe(true)
  })
})

describe('AppRail', () => {
  it('collapses and expands the panel and remembers the choice', async () => {
    useViewer().viewer.value = viewerWith('owner')
    const wrapper = track(await mountSuspended(AppRail))
    const toggle = wrapper.find('[data-testid="panel-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    await toggle.trigger('click')
    expect(useNavPanel().panelOpen.value).toBe(false)
    expect(window.localStorage.getItem('tt.nav-panel')).toBe('closed')
    expect(wrapper.find('[data-testid="panel-toggle"]').attributes('aria-expanded')).toBe('false')
    useNavPanel().restore()
    expect(useNavPanel().panelOpen.value).toBe(false)
  })

  it('links every section with an accessible name', async () => {
    useViewer().viewer.value = viewerWith('owner')
    const wrapper = track(await mountSuspended(AppRail))
    const labels = wrapper.findAll('nav a').map((link) => link.attributes('aria-label'))
    expect(labels).toEqual(['Panoramica', 'Annunci', 'Template', 'Membri', 'Registro delle azioni'])
  })
})

describe('AppTopBar', () => {
  it('renders the breadcrumbs with the current page last and opens the drawer', async () => {
    const wrapper = track(await mountSuspended(AppTopBar, { props: { crumbs: [{ label: 'Annunci', to: '/app/jobs' }, { label: 'Data Engineer' }] } }))
    expect(wrapper.find('nav a[href="/app/jobs"]').text()).toBe('Annunci')
    expect(wrapper.find('[aria-current="page"]').text()).toBe('Data Engineer')
    await wrapper.find('[aria-controls="nav-drawer"]').trigger('click')
    expect(useNavPanel().drawerOpen.value).toBe(true)
  })
})
