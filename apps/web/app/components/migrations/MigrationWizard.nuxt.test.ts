import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { commitCounts, issue, issuesPage, mapped, migration } from '~~/test/fixtures/migration-fixtures'
import MigrationWizard from './MigrationWizard.vue'

const state = vi.hoisted(() => ({ batch: null as unknown, bodies: {} as Record<string, unknown>, calls: [] as string[], commitFails: false }))
registerEndpoint('/api/v1/migrations/m1', { method: 'GET', handler: () => ok(state.batch) })
registerEndpoint('/api/v1/migrations/m1/issues', {
  method: 'GET',
  handler: () => ok(issuesPage([issue('i1', 'warning', 'consent_expired', 'c2'), issue('i2', 'warning', 'consent_expired', 'c9')], 2)),
})
registerEndpoint('/api/v1/migrations/m1/choices', {
  method: 'PUT',
  handler: async (event) => {
    const body = (await readBody(event)) as { stageNames?: { name: string; type: string }[]; excludedJobs?: string[] }
    state.calls.push('choices')
    state.bodies.choices = body
    let batch = state.batch as ReturnType<typeof migration>
    for (const choice of body.stageNames ?? []) batch = mapped(batch, choice.name, choice.type)
    if (body.excludedJobs) batch = { ...batch, excludedJobs: body.excludedJobs }
    state.batch = batch
    return ok(batch)
  },
})
registerEndpoint('/api/v1/migrations/m1/commit', {
  method: 'POST',
  handler: async (event) => {
    state.calls.push('commit')
    state.bodies.commit = await readBody(event)
    if (state.commitFails) {
      setResponseStatus(event, 422)
      return { success: false, data: null, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'migration', message: 'stages_unmapped:1' }] } }
    }
    state.batch = migration({ status: 'importing', declarations: { at: '2026-10-16T10:00:00.000Z', controller: true, previewChecked: true, processorsOwned: true } })
    return ok(state.batch)
  },
})

const mounted: { unmount: () => void }[] = []
const mountWizard = async () => {
  const wrapper = await mountSuspended(MigrationWizard, { props: { migrationId: 'm1' }, attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid$="-step"]').exists()).toBe(true))
  return wrapper
}
const wait = (wrapper: Awaited<ReturnType<typeof mountWizard>>, step: string) => vi.waitFor(() => expect(wrapper.find(`[data-testid="migration-${step}-step"]`).exists()).toBe(true))

beforeEach(() => {
  state.batch = migration()
  state.bodies = {}
  state.calls = []
  state.commitFails = false
  clearNuxtData()
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('migration wizard', () => {
  it('shows the analysis while the worker reads the package', async () => {
    state.batch = migration({ status: 'analyzing', counts: {} })
    const wrapper = await mountWizard()
    expect(wrapper.find('[data-testid="migration-analysis-step"]').text()).toContain('Analisi in corso')
  })

  it('says why a package could not be read and that nothing was written', async () => {
    state.batch = migration({ status: 'failed', error: 'missing_manifest', counts: {} })
    const wrapper = await mountWizard()
    expect(wrapper.find('[data-testid="migration-failed"]').text()).toContain('Non è stato scritto nulla')
    expect(wrapper.find('[data-testid="migration-failure-reason"]').text()).toContain('manca migration.json')
  })

  it('previews counts, consent, jobs and the findings in plain language', async () => {
    const wrapper = await mountWizard()
    await wait(wrapper, 'preview')
    expect(wrapper.find('[data-figure="applications"]').text()).toContain('6')
    expect(wrapper.find('[data-consent="given"]').text()).toContain('3')
    expect(wrapper.find('[data-consent="toRenew"]').text()).toContain('2')
    expect(wrapper.find('[data-consent="expired"]').text()).toContain('1')
    const jobs = wrapper.findAll('[data-testid="migration-jobs"] li')
    expect(jobs.map((job) => job.attributes('data-job'))).toEqual(['j1', 'j2'])
    expect(jobs[0]?.text()).toContain('Archived Backend')
    expect(wrapper.find('[data-testid="migration-beta"]').exists()).toBe(false)

    await wrapper.find('[data-testid="migration-issues-show-warning"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="migration-issues-warning"] [data-code="consent_expired"]').exists()).toBe(true))
    const group = wrapper.find('[data-code="consent_expired"]').text()
    expect(group).toContain('2 persone escluse: conservazione già scaduta')
    expect(group).toContain('c2, c9')
  })

  it('shows the beta notice for a connector that is not verified yet', async () => {
    state.batch = migration({ connectorMaturity: 'beta', sourceSystem: 'teamtailor' })
    const wrapper = await mountWizard()
    expect(wrapper.find('[data-testid="migration-beta"]').text()).toContain('teamtailor')
    expect(wrapper.find('[data-testid="migration-beta"]').text()).toContain('non ancora verificato')
  })

  it('maps stages by name for every job, leaves a job out and only then lets the person go on', async () => {
    const wrapper = await mountWizard()
    await wait(wrapper, 'preview')
    await wrapper.find('[data-testid="migration-preview-next"]').trigger('click')
    await wait(wrapper, 'stages')
    expect(wrapper.find('[data-testid="migration-remaining"]').text()).toContain('2 fasi ancora da scegliere')
    expect(wrapper.find('[data-testid="migration-stages-next"]').attributes('disabled')).toBeDefined()

    const select = wrapper.find('[data-name="applied"] select')
    await select.setValue('received')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="migration-all-mapped"]').exists()).toBe(true))
    expect(state.bodies.choices).toEqual({ stageNames: [{ name: 'Applied', type: 'received' }] })

    await wrapper.find('[data-job="j2"] [data-testid="migration-job-include"]').setValue(false)
    await vi.waitFor(() => expect(state.bodies.choices).toEqual({ excludedJobs: ['j2'] }))
    await vi.waitFor(() => expect(wrapper.find('[data-job="j2"]').text()).toContain('Escluso'))
    expect(wrapper.find('[data-testid="migration-stages-next"]').attributes('disabled')).toBeUndefined()
  })

  it('sends the three declarations when confirming, then follows the migration', async () => {
    state.batch = mapped(mapped(migration(), 'Applied', 'received'), 'Applied', 'received')
    const wrapper = await mountWizard()
    await wait(wrapper, 'preview')
    await wrapper.find('[data-testid="migration-preview-next"]').trigger('click')
    await wait(wrapper, 'stages')
    await wrapper.find('[data-testid="migration-stages-next"]').trigger('click')
    await wait(wrapper, 'confirm')
    expect(wrapper.find('[data-testid="migration-confirm"]').attributes('disabled')).toBeDefined()
    for (const key of ['controller', 'previewChecked', 'processorsOwned']) await wrapper.find(`[data-testid="declaration-${key}"]`).setValue(true)
    await wrapper.find('[data-testid="migration-confirm"]').trigger('click')
    await wait(wrapper, 'result')
    expect(state.calls).toEqual(['commit'])
    expect(state.bodies.commit).toEqual({ declarations: { controller: true, previewChecked: true, processorsOwned: true } })
    expect(wrapper.find('[data-testid="migration-result-step"]').attributes('data-status')).toBe('importing')
  })

  it('shows the api refusal in words when the commit is refused', async () => {
    state.batch = mapped(mapped(migration(), 'Applied', 'received'), 'Applied', 'received')
    state.commitFails = true
    const wrapper = await mountWizard()
    await wait(wrapper, 'preview')
    await wrapper.find('[data-testid="migration-preview-next"]').trigger('click')
    await wait(wrapper, 'stages')
    await wrapper.find('[data-testid="migration-stages-next"]').trigger('click')
    await wait(wrapper, 'confirm')
    for (const key of ['controller', 'previewChecked', 'processorsOwned']) await wrapper.find(`[data-testid="declaration-${key}"]`).setValue(true)
    await wrapper.find('[data-testid="migration-confirm"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="migration-refusal"]').text()).toContain('1 fase non ha ancora un tipo'))
    expect(wrapper.find('[data-testid="migration-confirm-step"]').exists()).toBe(true)
  })

  it('shows what was written and explains the undo before it runs', async () => {
    state.batch = migration({ status: 'done', committedAt: '2026-10-16T11:00:00.000Z', counts: { ...migration().counts, commit: commitCounts } })
    const wrapper = await mountWizard()
    expect(wrapper.find('[data-testid="migration-written"]').text()).toContain('4 persone nuove')
    expect(wrapper.find('[data-testid="migration-written"]').text()).toContain('1 persona unita a un candidato esistente')
    expect(wrapper.find('[data-testid="migration-open-jobs"]').attributes('href')).toBe('/app/jobs')
    await wrapper.find('[data-testid="migration-undo"]').trigger('click')
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="migration-undo-dialog"]')).not.toBeNull())
    const dialog = document.body.querySelector('[data-testid="migration-undo-dialog"]')!
    expect(dialog.textContent).toContain('4 persone')
    expect(dialog.textContent).toContain('Restano le persone che hanno confermato il consenso')
    expect(dialog.textContent).toContain('La scheda della migrazione resta')
  })
})
