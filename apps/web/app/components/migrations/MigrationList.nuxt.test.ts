import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { commitCounts, migration } from '~~/test/fixtures/migration-fixtures'
import MigrationList from './MigrationList.vue'

const state = vi.hoisted(() => ({ batches: [] as unknown[], undone: [] as string[] }))
registerEndpoint('/api/v1/migrations', { method: 'GET', handler: () => ok(state.batches) })
registerEndpoint('/api/v1/migrations/m1/undo', {
  method: 'POST',
  handler: () => {
    state.undone.push('m1')
    state.batches = [migration({ status: 'undone' })]
    return ok({ batch: migration({ status: 'undone' }), counts: { applicationsErased: 6, candidatesErased: 4, keptReconfirmed: 0, keptAppliedAgain: 0, jobsDeleted: 2, jobsKept: 0, historyDeleted: 5, failed: 0 } })
  },
})

const mounted: { unmount: () => void }[] = []
const mountList = async () => {
  const wrapper = await mountSuspended(MigrationList, { attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.findAll('[data-testid="migration-item"], [data-testid="migrations-empty"]').length).toBeGreaterThan(0))
  return wrapper
}

beforeEach(() => {
  state.batches = [
    migration({ status: 'done', counts: { ...migration().counts, commit: commitCounts } }),
    migration({ id: 'm2', status: 'ready', createdAt: '2026-10-09T09:00:00.000Z' }),
    migration({ id: 'm3', status: 'analyzing', sourceSystem: '', counts: {}, createdAt: '2026-10-08T09:00:00.000Z' }),
  ]
  state.undone = []
  clearNuxtData()
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('migration list', () => {
  it('shows date, source, status and what the package holds, newest first', async () => {
    const wrapper = await mountList()
    const rows = wrapper.findAll('[data-testid="migration-item"]')
    expect(rows.map((row) => row.attributes('data-status'))).toEqual(['done', 'ready', 'analyzing'])
    expect(rows[0]?.text()).toContain('da oldats')
    expect(rows[0]?.text()).toContain('2 annunci')
    expect(rows[0]?.text()).toContain('6 candidature')
    expect(rows[2]?.text()).toContain('pacchetto non ancora letto')
  })

  it('resumes one to review and offers the undo only for a finished one', async () => {
    const wrapper = await mountList()
    const rows = wrapper.findAll('[data-testid="migration-item"]')
    expect(rows[1]?.text()).toContain('Riprendi')
    expect(rows[1]?.find('[data-testid="migration-list-undo"]').exists()).toBe(false)
    expect(rows[0]?.find('[data-testid="migration-list-undo"]').exists()).toBe(true)
  })

  it('explains what is erased and kept, then undoes', async () => {
    const wrapper = await mountList()
    await wrapper.find('[data-testid="migration-list-undo"]').trigger('click')
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="migration-undo-dialog"]')).not.toBeNull())
    const dialog = document.body.querySelector('[data-testid="migration-undo-dialog"]')!
    expect(dialog.querySelector('[data-testid="migration-undo-deleted"]')?.textContent).toContain('4 persone')
    expect(dialog.querySelector('[data-testid="migration-undo-deleted"]')?.textContent).toContain('2 annunci')
    expect(dialog.querySelector('[data-testid="migration-undo-kept"]')?.textContent).toContain('si sono candidate di nuovo')
    ;(dialog.querySelector('[data-testid="migration-undo-confirm"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(state.undone).toEqual(['m1']))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="migration-item"]').attributes('data-status')).toBe('undone'))
  })

  it('invites to start a migration when there is none', async () => {
    state.batches = []
    const wrapper = await mountList()
    expect(wrapper.find('[data-testid="migrations-empty"]').text()).toContain('Nessuna migrazione')
  })
})
