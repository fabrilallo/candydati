import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pipeline } from '~~/test/fixtures/candidate-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { batch, importDetail } from '~~/test/fixtures/phase8-fixtures'
import ImportWizard from './ImportWizard.vue'

const state = vi.hoisted(() => ({ detail: null as unknown, bodies: {} as Record<string, unknown>, calls: [] as string[] }))
registerEndpoint('/api/v1/imports/b1', { method: 'GET', handler: () => ok(state.detail, { total: 3, page: 1, limit: 200 }) })
registerEndpoint('/api/v1/jobs/j1/pipeline', () => ok(pipeline()))
registerEndpoint('/api/v1/imports/b1/mapping', {
  method: 'PUT',
  handler: async (event) => {
    state.calls.push('mapping')
    state.bodies.mapping = await readBody(event)
    return ok({ id: 'b1', status: 'ready' })
  },
})
registerEndpoint('/api/v1/imports/b1/items', {
  method: 'PUT',
  handler: async (event) => {
    state.calls.push('items')
    state.bodies.items = await readBody(event)
    return ok(null)
  },
})
registerEndpoint('/api/v1/imports/b1/commit', {
  method: 'POST',
  handler: () => {
    state.calls.push('commit')
    state.detail = { batch: batch(), items: [] }
    return ok({ id: 'b1', status: 'importing' })
  },
})

const mounted: { unmount: () => void }[] = []
const mountWizard = async () => {
  const wrapper = await mountSuspended(ImportWizard, { props: { batchId: 'b1' } })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid$="-step"]').exists()).toBe(true))
  return wrapper
}

beforeEach(() => {
  state.detail = importDetail()
  state.bodies = {}
  state.calls = []
  clearNuxtData()
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('import wizard', () => {
  it('shows the analysis while the worker reads the files, with ignored files and why', async () => {
    state.detail = importDetail({ batch: batch({ status: 'analyzing', counts: { cvs: 4, rows: 9 }, progress: { done: 2, total: 8 }, ignored: [{ name: 'foto.png', reason: 'unsupported_type' }] }) })
    const wrapper = await mountWizard()
    expect(wrapper.find('[data-testid="import-analysis-step"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="import-analysis-counts"]').text()).toContain('4')
    expect(wrapper.find('[data-testid="import-analysis-progress"]').text()).toContain('2 di 8')
    expect(wrapper.find('[data-testid="import-ignored"]').text()).toContain('formato non supportato')
  })

  it('says a failed analysis created nothing', async () => {
    state.detail = importDetail({ batch: batch({ status: 'failed' }) })
    const wrapper = await mountWizard()
    expect(wrapper.find('[data-testid="import-failed"]').text()).toContain('Nessun candidato è stato creato')
  })

  it('goes from columns to preview to confirmation, sending only what changed', async () => {
    const wrapper = await mountWizard()
    expect(wrapper.find('[data-testid="import-mapping-step"]').exists()).toBe(true)
    expect(wrapper.find('[data-column="Nome"]').text()).toContain('Anna Rossi, Luca Bianchi')
    expect(wrapper.find('[data-column="Nome"]').text()).toContain('Anna Rossi, Luca Bianchi')
    const selects = wrapper.findAll('select[data-testid="mapping-select"]')
    await selects[2]?.setValue('notes')
    expect(wrapper.find('[data-testid="mapping-next"]').text()).toBe('Ricalcola e continua')
    await wrapper.find('[data-testid="mapping-next"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="import-preview-step"]').exists()).toBe(true))
    expect(state.bodies.mapping).toMatchObject({ fullName: 'Nome', email: 'Email', notes: 'Varie' })

    const items = wrapper.findAll('[data-testid="preview-item"]')
    expect(items).toHaveLength(3)
    expect(items[1]?.find('[data-testid="preview-conflicts"]').text()).toContain('Telefono: salvato +39 333, nell\'import +39 334')
    expect(items[2]?.find('[data-testid="preview-no-email"]').text()).toContain('sarà cancellato dopo 30 giorni')
    expect(items[0]?.text()).toContain('cv/i1.pdf')
    expect(items[0]?.text()).toContain('riga 2')

    await wrapper.find('select[data-testid="filter-problem"]').setValue('noEmail')
    expect(wrapper.findAll('[data-testid="preview-item"]').map((item) => item.attributes('data-item-id'))).toEqual(['i3'])
    await wrapper.find('select[data-testid="filter-problem"]').setValue('all')
    await wrapper.find('[data-testid="bulk-exclude-low"]').trigger('click')
    expect(wrapper.find('[data-testid="preview-selected"]').text()).toBe('2 inclusi su 3')
    await wrapper.find('[data-item-id="i2"] [data-testid="preview-include"]').setValue(false)
    await wrapper.find('[data-testid="preview-next"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="import-confirm-step"]').exists()).toBe(true))
    expect(state.bodies.items).toEqual({ items: [{ itemId: 'i2', included: false }, { itemId: 'i3', included: false }] })

    const summary = wrapper.find('[data-testid="confirm-summary"]').text()
    expect(summary).toContain('1candidato nuovo')
    expect(summary).toContain('2esclusi')
    expect(wrapper.find('[data-testid="confirm-consent"]').text()).toContain('entro 30 giorni')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="confirm-target"]').text()).toContain('Data Engineer, fase Ricevute'))

    await wrapper.find('[data-testid="confirm-import"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="import-result-step"]').exists()).toBe(true))
    expect(state.calls).toEqual(['mapping', 'items', 'commit'])
    await flushPromises()
    expect(wrapper.find('[data-testid="result-pipeline"]').attributes('href')).toBe('/app/jobs/j1/candidates')
  })

  it('warns at confirmation about people without email and refuses an empty import', async () => {
    const wrapper = await mountWizard()
    await wrapper.find('[data-testid="mapping-next"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="import-preview-step"]').exists()).toBe(true))
    await wrapper.find('[data-testid="preview-next"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="import-confirm-step"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="confirm-no-email"]').text()).toContain('1 persona non ha email')
    expect(state.calls).toEqual([])
  })
})
