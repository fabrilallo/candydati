import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notice } from '~~/test/fixtures/candidate-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { dataExport, processingRecord, retentionOverview } from '~~/test/fixtures/phase5-fixtures'
import DataExportsPanel from './DataExportsPanel.vue'
import PrivacyDocuments from './PrivacyDocuments.vue'
import RetentionOverview from './RetentionOverview.vue'

const state = vi.hoisted(() => ({ retention: null as unknown, notice: null as unknown, exports: [] as unknown[], created: 0, listed: 0, record: null as unknown }))
registerEndpoint('/api/v1/privacy/retention', () => ok(state.retention))
registerEndpoint('/api/v1/privacy-notice', () => ok(state.notice))
registerEndpoint('/api/v1/privacy/processing-record', () => ok(state.record))
registerEndpoint('/api/v1/exports', {
  method: 'GET',
  handler: () => {
    state.listed += 1
    return ok(state.exports)
  },
})
registerEndpoint('/api/v1/exports', {
  method: 'POST',
  handler: () => {
    state.created += 1
    return ok({ id: 'e9', status: 'pending' })
  },
})

const mounted: { unmount: () => void }[] = []
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-13T10:00:00.000Z'))
  state.retention = retentionOverview()
  state.notice = notice()
  state.exports = [dataExport('e1'), dataExport('e2', { status: 'ready', createdAt: '2026-10-01T09:00:00.000Z', expiresAt: '2026-10-08T09:00:00.000Z' })]
  state.created = 0
  state.listed = 0
  state.record = processingRecord()
  clearNuxtData()
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
})

describe('retention overview', () => {
  it('explains retention with the organization periods, lists expiries soonest first and the last runs', async () => {
    const wrapper = await mountSuspended(RetentionOverview)
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="retention-upcoming"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="retention-explain"]').text()).toContain('1 anno per la sola selezione, 2 anni se la persona entra nel database candidati')
    const items = wrapper.findAll('[data-testid="retention-item"]')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('Luca Neri')
    expect(items[0]?.text()).toContain('tra 5 giorni')
    expect(items[1]?.text()).toContain('Marta Verdi')
    expect(items[1]?.find('a').attributes('href')).toBe('/app/candidates/c-a1?application=a1')
    expect(wrapper.find('[data-testid="retention-run"]').text()).toContain('2 avvisi, 1 candidatura cancellata')
  })

  it('says so when nothing expires and the job has not run yet', async () => {
    state.retention = { upcoming: [], lastRuns: [] }
    state.notice = null
    const wrapper = await mountSuspended(RetentionOverview)
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="retention-upcoming-empty"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="retention-runs-empty"]').text()).toContain('ogni notte')
    expect(wrapper.find('[data-testid="retention-explain"]').text()).toContain("Pubblica l'informativa")
  })
})

describe('organization export', () => {
  it('shows status, size and expiry, with the download only while ready', async () => {
    const wrapper = await mountSuspended(DataExportsPanel)
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="export-item"]')).toHaveLength(2))
    const [ready, expired] = wrapper.findAll('[data-testid="export-item"]')
    expect(ready?.find('[data-testid="export-status"]').text()).toBe('Pronto')
    expect(ready?.text()).toContain('2,5 MB')
    expect(ready?.text()).toContain('Scaricabile fino al 20 ott 2026')
    expect(ready?.find('[data-testid="export-download"]').attributes('href')).toBe('/api/v1/exports/e1/download')
    expect(expired?.find('[data-testid="export-status"]').text()).toBe('Scaduto')
    expect(expired?.find('[data-testid="export-download"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="export-polling"]').exists()).toBe(false)
  })

  it('starts an export, shows it as being prepared and keeps asking until it is ready', async () => {
    state.exports = []
    const wrapper = await mountSuspended(DataExportsPanel)
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="exports-empty"]').exists()).toBe(true))
    await wrapper.find('[data-testid="export-create"]').trigger('click')
    await vi.waitFor(() => expect(state.created).toBe(1))
    await flushPromises()
    expect(wrapper.find('[data-testid="export-status"]').text()).toBe('In preparazione')
    expect(wrapper.find('[data-testid="export-polling"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="export-create"]').attributes('disabled')).toBeDefined()
    state.exports = [dataExport('e9')]
    const before = state.listed
    await vi.waitFor(() => expect(state.listed).toBeGreaterThan(before), { timeout: 7_000 })
    await vi.waitFor(() => expect(wrapper.find('[data-testid="export-status"]').text()).toBe('Pronto'))
    expect(wrapper.find('[data-testid="export-polling"]').exists()).toBe(false)
  }, 10_000)
})

describe('privacy documents', () => {
  it('fills the registro with the organization data and lists the templates as paths', async () => {
    const wrapper = await mountSuspended(PrivacyDocuments)
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="processing-record"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="record-controller"]').text()).toContain('Acme')
    expect(wrapper.find('[data-testid="record-contact"]').text()).toContain('privacy@acme.test')
    expect(wrapper.find('[data-testid="record-retention"]').text()).toContain('1 anno per la sola selezione, 2 anni per il database candidati')
    expect(wrapper.find('[data-testid="record-recipients"]').text()).toContain('Modello linguistico: mistral/mistral-small')
    const templates = wrapper.findAll('[data-testid="legal-template"]')
    expect(templates).toHaveLength(5)
    expect(templates[2]?.find('code').text()).toBe('docs/legal/dpa.md')
    expect(wrapper.find('[data-testid="legal-templates"] a').exists()).toBe(false)
  })

  it('says what is missing instead of inventing it', async () => {
    state.record = processingRecord({ organization: { name: 'Acme', contactEmail: null }, retentionDays: null, providers: { storage: 'local', email: 'resend', model: null } })
    const wrapper = await mountSuspended(PrivacyDocuments)
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="processing-record"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="record-contact"]').text()).toContain('Non indicato')
    expect(wrapper.find('[data-testid="record-retention"]').text()).toContain('Da definire')
    expect(wrapper.find('[data-testid="record-recipients"]').text()).toContain('Archiviazione dei file: local')
    expect(wrapper.find('[data-testid="record-recipients"]').text()).not.toContain('modello')
  })
})
