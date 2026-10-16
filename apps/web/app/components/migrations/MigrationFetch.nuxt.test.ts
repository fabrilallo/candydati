import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import { connector, migration } from '~~/test/fixtures/migration-fixtures'
import MigrationAnalysisStep from './MigrationAnalysisStep.vue'
import MigrationParts from './MigrationParts.vue'
import MigrationPreviewStep from './MigrationPreviewStep.vue'

const state = vi.hoisted(() => ({ batches: [] as unknown[] }))
registerEndpoint('/api/v1/migrations/connectors', { method: 'GET', handler: () => ok([connector()]) })
registerEndpoint('/api/v1/migrations', { method: 'GET', handler: () => ok(state.batches) })
registerEndpoint('/api/v1/migrations/m1/issues', { method: 'GET', handler: () => ok({ items: [], total: 0, page: 1, limit: 50 }) })

const mounted: { unmount: () => void }[] = []
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))
beforeEach(() => {
  state.batches = []
  clearNuxtData()
})
const fetching = (fetch: Record<string, unknown>) => migration({ status: 'fetching', sourceSystem: 'acme', connectorMaturity: 'beta', counts: { fetch }, groupId: 'm1', part: 1 })
const part = (id: string, n: number, status: string) => migration({ id, status, sourceSystem: 'acme', connectorMaturity: 'beta', groupId: 'm1', part: n, counts: { fetch: { done: 9, total: 9, parts: 3 } } })

describe('reading from a connector', () => {
  it('shows a share once the source said how much there is, with the vendor name', async () => {
    const wrapper = await mountSuspended(MigrationAnalysisStep, { props: { batch: fetching({ done: 30, total: 120 }) as never } })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="migration-fetching"]').text()).toContain('Lettura da Acme ATS'))
    expect(wrapper.find('[data-testid="migration-fetch-count"]').text()).toBe('30 di 120 letti')
    expect(wrapper.find('[data-testid="migration-fetch-bar"]').attributes('aria-valuenow')).toBe('25')
    expect(wrapper.find('[data-testid="migration-fetching"]').attributes('aria-live')).toBe('polite')
  })

  it('shows the count alone while the total is unknown', async () => {
    const wrapper = await mountSuspended(MigrationAnalysisStep, { props: { batch: fetching({ done: 7, total: null }) as never } })
    mounted.push(wrapper)
    expect(wrapper.find('[data-testid="migration-fetch-count"]').text()).toBe('7 letti finora')
    expect(wrapper.find('[data-testid="migration-fetch-bar"]').attributes('aria-valuenow')).toBeUndefined()
  })

  it('says the credentials are gone when the reading failed', async () => {
    const wrapper = await mountSuspended(MigrationAnalysisStep, { props: { batch: migration({ status: 'failed', error: 'credentials_refused', counts: {} }) as never } })
    mounted.push(wrapper)
    expect(wrapper.find('[data-testid="migration-failed"]').text()).toContain('le credenziali sono state cancellate')
    expect(wrapper.find('[data-testid="migration-failure-reason"]').text()).toContain('la fonte ha rifiutato le credenziali')
  })

  it('names the connector in the beta notice of the preview', async () => {
    const wrapper = await mountSuspended(MigrationPreviewStep, { props: { batch: migration({ sourceSystem: 'acme', connectorMaturity: 'beta' }) as never } })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="migration-beta"]').text()).toContain('Acme ATS'))
  })
})

describe('parts of a migration', () => {
  it('names the part and links to the others with their status', async () => {
    state.batches = [part('m3', 3, 'analyzing'), part('m1', 1, 'ready'), part('m2', 2, 'done'), migration({ id: 'x' })]
    const wrapper = await mountSuspended(MigrationParts, { props: { batch: part('m2', 2, 'done') as never } })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="migration-parts"] li')).toHaveLength(3))
    expect(wrapper.find('[data-testid="migration-part-current"]').text()).toBe('Parte 2 di 3')
    expect(wrapper.text()).toContain('è stata divisa in 3 parti')
    expect(wrapper.find('[aria-current="page"]').text()).toContain('Parte 2')
    expect(wrapper.find('[data-part="1"]').attributes('href')).toBe('/app/migrations/m1')
    expect(wrapper.find('[data-part="3"]').text()).toContain('In analisi')
  })

  it('shows nothing for an uploaded package or a fetch that fit in one part', async () => {
    const upload = await mountSuspended(MigrationParts, { props: { batch: migration() as never } })
    mounted.push(upload)
    expect(upload.find('[data-testid="migration-parts"]').exists()).toBe(false)
    state.batches = [fetching({ done: 3, total: 3, parts: 1 })]
    const single = await mountSuspended(MigrationParts, { props: { batch: fetching({ done: 3, total: 3, parts: 1 }) as never } })
    mounted.push(single)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(single.find('[data-testid="migration-parts"]').exists()).toBe(false)
  })
})
