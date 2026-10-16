import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import { connector } from '~~/test/fixtures/migration-fixtures'
import MigrationConnectorFiles from './MigrationConnectorFiles.vue'
import MigrationFetchNotices from './MigrationFetchNotices.vue'
import MigrationSourceStep from './MigrationSourceStep.vue'

const state = vi.hoisted(() => ({ connectors: [] as unknown[] }))
registerEndpoint('/api/v1/migrations/connectors', { method: 'GET', handler: () => ok(state.connectors) })

const inrecruiting = () => connector({ id: 'inrecruiting', label: 'Zucchetti InRecruiting', input: 'files', docsUrl: 'https://docs.kombo.dev/ats/connectors/inrecruiting', fields: [] })

const mounted: { unmount: () => void }[] = []
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))
beforeEach(() => {
  state.connectors = []
  clearNuxtData()
})

const mountForm = async () => {
  const wrapper = await mountSuspended(MigrationConnectorFiles, { props: { connector: inrecruiting() as never } })
  mounted.push(wrapper)
  return wrapper
}
const pick = async (wrapper: Awaited<ReturnType<typeof mountForm>>, testid: string, file: File) => {
  const input = wrapper.find(`[data-testid="${testid}"]`)
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}

describe('file connector card', () => {
  it('says to upload the export, with the beta badge, and hands the connector over', async () => {
    state.connectors = [inrecruiting()]
    const wrapper = await mountSuspended(MigrationSourceStep)
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-connector="inrecruiting"]').exists()).toBe(true))
    const card = wrapper.find('[data-connector="inrecruiting"]')
    expect(card.find('[data-testid="connector-files-sentence"]').text()).toBe('Carica l’export di Zucchetti InRecruiting')
    expect(card.find('[data-testid="connector-beta"]').text()).toBe('Beta')
    await wrapper.find('[data-testid="source-connector-inrecruiting"]').trigger('click')
    expect((wrapper.emitted('connect')?.[0]?.[0] as { id: string }).id).toBe('inrecruiting')
  })
})

describe('file connector form', () => {
  it('asks for a spreadsheet, offers a ZIP of CVs, shows the beta notice and links the guide', async () => {
    const wrapper = await mountForm()
    expect(wrapper.find('[data-testid="migration-beta"]').text()).toContain('Zucchetti InRecruiting')
    expect(wrapper.find('[data-testid="migration-files-guide"]').attributes()).toMatchObject({ target: '_blank', rel: 'noopener noreferrer' })
    expect(wrapper.find('[data-testid="migration-files-guide"]').attributes('href')).toBe('https://fabrilallo.github.io/candydati/it/guide/migration#inrecruiting')
    expect(wrapper.find('[data-testid="migration-files-submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="migration-files-cvs-input"]').exists()).toBe(true)
  })

  it('refuses what is not a spreadsheet or a ZIP, and enables the button once the spreadsheet is chosen', async () => {
    const wrapper = await mountForm()
    await pick(wrapper, 'migration-files-sheet-input', new File(['x'], 'export.pdf'))
    expect(wrapper.find('[data-testid="migration-files-sheet-error"]').text()).toContain('CSV o XLSX')
    expect(wrapper.find('[data-testid="migration-files-submit"]').attributes('disabled')).toBeDefined()
    await pick(wrapper, 'migration-files-cvs-input', new File(['x'], 'cvs.rar'))
    expect(wrapper.find('[data-testid="migration-files-cvs-error"]').exists()).toBe(true)
    await pick(wrapper, 'migration-files-sheet-input', new File(['a;b'], 'export.csv'))
    expect(wrapper.find('[data-testid="migration-files-sheet-picked"]').text()).toContain('export.csv')
    expect(wrapper.find('[data-testid="migration-files-sheet-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="migration-files-submit"]').attributes('disabled')).toBeUndefined()
    await pick(wrapper, 'migration-files-cvs-input', new File(['PK'], 'cvs.zip'))
    expect(wrapper.find('[data-testid="migration-files-cvs-picked"]').text()).toContain('cvs.zip')
    await wrapper.find('[data-testid="migration-files-cvs-picked"] button').trigger('click')
    expect(wrapper.find('[data-testid="migration-files-cvs-picked"]').exists()).toBe(false)
    await wrapper.find('[data-testid="migration-files-sheet-picked"] button').trigger('click')
    expect(wrapper.find('[data-testid="migration-files-sheet-picked"]').exists()).toBe(false)
  })

  it('goes back to the source choice', async () => {
    const wrapper = await mountForm()
    await wrapper.findAll('button').find((button) => button.text() === 'Indietro')?.trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
  })
})

describe('what the reading noted', () => {
  it('lists the columns left out and ignored, by header, and nothing when there is nothing', async () => {
    const empty = await mountSuspended(MigrationFetchNotices, { props: { notices: [] } })
    mounted.push(empty)
    expect(empty.find('[data-testid="migration-notices"]').exists()).toBe(false)
    const wrapper = await mountSuspended(MigrationFetchNotices, {
      props: { notices: [{ code: 'columns_unrecognized', count: 1, headers: ['Taglia scarpe'] }, { code: 'columns_ignored', count: 2, headers: ['Valutazione', 'Punteggio'] }, { code: 'rows_skipped', count: 3 }] },
    })
    mounted.push(wrapper)
    expect(wrapper.find('[data-notice="columns_unrecognized"]').text()).toContain('Taglia scarpe')
    expect(wrapper.find('[data-notice="columns_ignored"]').text()).toContain('Valutazione, Punteggio')
    expect(wrapper.find('[data-notice="rows_skipped"]').text()).toContain('3')
    expect(wrapper.text()).toContain('rinominala')
  })
})
