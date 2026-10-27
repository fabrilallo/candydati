import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { viewerWith } from '~~/test/fixtures/job-fixtures'
import { jobStatsFixture } from '~~/test/fixtures/job-stats'
import AppNavPanel from './AppNavPanel.vue'
import AppTopBar from './AppTopBar.vue'

registerEndpoint('/api/v1/stats/jobs', () => ({ success: true, data: jobStatsFixture(), error: null }))
const candidates = vi.hoisted(() => ({ total: 12 }))
registerEndpoint('/api/v1/candidates', () => ({ success: true, data: [], error: null, meta: { total: candidates.total, page: 1, limit: 1 } }))
const logo = vi.hoisted(() => ({ url: null as string | null }))
registerEndpoint('/api/v1/organization/logo', () => ({ success: true, data: { source: logo.url ? { kind: 'url', url: logo.url } : null, url: logo.url }, error: null }))

const mounted: { unmount: () => void }[] = []
const track = <T extends { unmount: () => void }>(wrapper: T): T => (mounted.push(wrapper), wrapper)

beforeEach(() => {
  clearNuxtData('job-stats')
  clearNuxtData('candidate-count')
  clearNuxtData((key) => key.startsWith('organization-logo'))
  logo.url = null
  candidates.total = 12
  window.localStorage.clear()
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

  it('counts the candidates for whoever can read them, and links the privacy settings for admins', async () => {
    useViewer().viewer.value = viewerWith('owner')
    const wrapper = track(await mountSuspended(AppNavPanel))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="nav-count-candidates"]').text()).toContain('12 candidati'))
    const links = wrapper.findAll('nav a').map((link) => link.attributes('href'))
    expect(links).toContain('/app/candidates')
    expect(links).toContain('/app/settings/privacy')
  })

  it('updates the candidate count when someone applies while the app is open in another tab', async () => {
    useViewer().viewer.value = viewerWith('owner')
    const wrapper = track(await mountSuspended(AppNavPanel))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="nav-count-candidates"]').text()).toContain('12 candidati'))
    candidates.total = 13
    const later = Date.now() + 60_000
    const now = vi.spyOn(Date, 'now').mockReturnValue(later)
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="nav-count-candidates"]').text()).toContain('13 candidati'))
    now.mockRestore()
  })

  it('updates the candidate count on moving to another section', async () => {
    useViewer().viewer.value = viewerWith('owner')
    const wrapper = track(await mountSuspended(AppNavPanel, { route: '/app' }))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="nav-count-candidates"]').text()).toContain('12 candidati'))
    candidates.total = 14
    await navigateTo('/app/candidates')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="nav-count-candidates"]').text()).toContain('14 candidati'))
  })

  it('hides what the role cannot open and never asks for job stats without job:read', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = track(await mountSuspended(AppNavPanel))
    const links = wrapper.findAll('nav a').map((link) => link.attributes('href'))
    expect(links).not.toContain('/app/settings/audit-log')
    expect(links).not.toContain('/app/jobs/templates')
    expect(links).not.toContain('/app/settings/privacy')
    expect(links).toContain('/app/candidates')
  })

  it("shows the organization's logo in the switcher, else its initials", async () => {
    useViewer().viewer.value = viewerWith('recruiter')
    const plain = track(await mountSuspended(AppNavPanel))
    await vi.waitFor(() => expect(plain.find('[data-testid="nav-count-jobs"]').exists()).toBe(true))
    expect(plain.find('[data-testid="org-logo"]').exists()).toBe(false)
    plain.unmount()
    clearNuxtData((key) => key.startsWith('organization-logo'))
    logo.url = 'https://cdn.example/logo.png'
    const branded = track(await mountSuspended(AppNavPanel))
    await vi.waitFor(() => expect(branded.find('[data-testid="org-logo"]').attributes('src')).toBe('https://cdn.example/logo.png'))
  })

  it('carries language, theme and the user menu inside the mobile drawer only', async () => {
    useViewer().viewer.value = viewerWith('owner')
    const desktop = track(await mountSuspended(AppNavPanel))
    expect(desktop.find('[aria-label="Lingua"]').exists()).toBe(false)
    const drawer = track(await mountSuspended(AppNavPanel, { props: { inDrawer: true } }))
    expect(drawer.find('[aria-label="Lingua"]').exists()).toBe(true)
  })
})

describe('single sidebar', () => {
  it('shows one labelled menu with the careers page and the user menu, without language controls on desktop', async () => {
    useViewer().viewer.value = viewerWith('owner')
    const wrapper = track(await mountSuspended(AppNavPanel))
    const labels = wrapper.findAll('nav a').map((link) => link.text().replace(/\d+$/, '').trim())
    expect(labels).toEqual(['Panoramica', 'Da gestire', 'Le mie attività', 'Annunci', 'Richieste', 'Candidati', 'Report', 'Import', 'Template', 'Membri', 'Sicurezza', 'Privacy', 'Email', 'AI', 'Modelli email', 'Webhook', 'Distribuzione', 'Pagina carriera', 'API e integrazioni', 'Dati', 'Migrazione', 'Registro delle azioni'])
    expect(wrapper.find('a[target="_blank"]').text()).toBe('Pagina carriere')
    expect(wrapper.find('[aria-label="Lingua"]').exists()).toBe(false)
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

  it('opens the assistant from the top bar and with its shortcut', async () => {
    useViewer().viewer.value = viewerWith('recruiter')
    const wrapper = track(await mountSuspended(AppTopBar, { props: { crumbs: [{ label: 'Annunci' }] } }))
    const button = wrapper.find('[data-testid="assistant-button"]')
    expect(button.text()).toContain('Assistente')
    expect(button.text()).toContain('J')
    await button.trigger('click')
    expect(useAssistant().open.value).toBe(true)
    await button.trigger('click')
    expect(useAssistant().open.value).toBe(false)
  })
})
