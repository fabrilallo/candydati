import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { batch } from '~~/test/fixtures/phase8-fixtures'
import ImportBatchList from './ImportBatchList.vue'

const state = vi.hoisted(() => ({ batches: [] as unknown[], undone: [] as string[] }))
registerEndpoint('/api/v1/imports', { method: 'GET', handler: () => ok(state.batches) })
registerEndpoint('/api/v1/imports/b1/undo', {
  method: 'POST',
  handler: () => {
    state.undone.push('b1')
    state.batches = [batch({ status: 'undone', undoneAt: '2026-10-13T10:00:00.000Z' })]
    return ok({ batch: batch({ status: 'undone' }), erased: 7, skippedReconfirmed: 2, failed: 0 })
  },
})

const mounted: { unmount: () => void }[] = []
const mountList = async () => {
  const wrapper = await mountSuspended(ImportBatchList, { attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.findAll('[data-testid="import-item"], [data-testid="imports-empty"]').length).toBeGreaterThan(0))
  return wrapper
}

beforeEach(() => {
  state.batches = [batch(), batch({ id: 'b2', status: 'ready', job: { id: 'j2', title: 'Product designer' }, jobId: 'j2', createdBy: { id: 'u2', name: 'Marco Gialli' }, importedAt: null, counts: { ...batch().counts, items: 4, included: 4, imported: 0, merged: 0 } })]
  state.undone = []
  clearNuxtData()
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('import list', () => {
  it('shows date, job, author, counts and status, resuming a batch still to review', async () => {
    const wrapper = await mountList()
    const rows = wrapper.findAll('[data-testid="import-item"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('Data Engineer')
    expect(rows[0]?.text()).toContain('di Elena Conti')
    expect(rows[0]?.find('[data-testid="import-counts"]').text()).toContain('7 nuovi, 3 uniti')
    expect(rows[0]?.find('[data-testid="import-status"]').text()).toBe('Importato')
    expect(rows[1]?.text()).toContain('Product designer')
    expect(rows[1]?.text()).toContain('di Marco Gialli')
    expect(rows[1]?.text()).toContain('4 candidati proposti')
    expect(rows[1]?.text()).toContain('Riprendi')
    expect(rows[1]?.find('[data-testid="import-undo"]').exists()).toBe(false)
  })

  it('undoes a done import after saying exactly what is erased and who stays', async () => {
    const wrapper = await mountList()
    await wrapper.find('[data-testid="import-undo"]').trigger('click')
    await flushPromises()
    const dialog = document.body.querySelector('[data-testid="undo-dialog"]')
    expect(dialog?.textContent).toContain('7 persone')
    expect(dialog?.textContent).toContain('3 persone')
    expect(dialog?.querySelector('[data-testid="undo-kept"]')?.textContent).toContain('hanno già confermato')
    document.body.querySelector<HTMLButtonElement>('[data-testid="undo-confirm"]')?.click()
    await vi.waitFor(() => expect(state.undone).toEqual(['b1']))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="import-item"]').attributes('data-status')).toBe('undone'))
  })

  it('says what to do when there is no import yet', async () => {
    state.batches = []
    const wrapper = await mountList()
    expect(wrapper.find('[data-testid="imports-empty"]').text()).toContain('Nuovo import')
  })
})
