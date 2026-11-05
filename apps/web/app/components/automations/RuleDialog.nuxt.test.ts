import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import { template } from '~~/test/fixtures/message-fixtures'
import { rule } from '~~/test/fixtures/phase4-fixtures'
import RuleDialog from './RuleDialog.vue'

const { state } = vi.hoisted(() => ({ state: { previews: [] as unknown[], items: true, runs: true } }))
registerEndpoint('/api/v1/automations/r1/runs', () =>
  ok(
    state.runs
      ? [{ id: 'x1', at: new Date(Date.now() - 2 * 86_400_000).toISOString(), trigger: 'stage_stuck', applicationId: 'a1', candidate: { id: 'c1', firstName: 'Anna', lastName: 'Rossi' } }]
      : [],
  ),
)
registerEndpoint('/api/v1/jobs/j1/automations/preview', async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  state.previews.push(body)
  return ok({
    trigger: 'stage_stuck',
    matching: 2,
    firingNow: 1,
    items: state.items
      ? [
          { applicationId: 'a1', candidateId: 'c1', firstName: 'Anna', lastName: 'Rossi', firesNow: true },
          { applicationId: 'a2', candidateId: 'c2', firstName: 'Bruno', lastName: 'Verdi', firesNow: false },
        ]
      : null,
  })
})

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  state.previews.length = 0
  state.items = true
  state.runs = true
})
const q = <T extends Element>(testId: string) => document.body.querySelector<T>(`[data-testid="${testId}"]`)
const select = async (testId: string, value: string) => {
  const element = q<HTMLSelectElement>(testId)
  if (!element) throw new Error(`no ${testId}`)
  element.value = value
  element.dispatchEvent(new Event('change'))
  await flushPromises()
}
const type = async (testId: string, value: string) => {
  const element = q<HTMLInputElement>(testId)
  if (!element) throw new Error(`no ${testId}`)
  element.value = value
  element.dispatchEvent(new Event('input'))
  await flushPromises()
}
const mountDialog = async (props: Record<string, unknown> = {}) => {
  const wrapper = await mountSuspended(RuleDialog, {
    props: { open: true, jobId: 'j1', stageLabel: 'Colloquio tecnico', stageId: 'tech', rule: null, templates: [template('t-update', { name: 'Aggiornamento' })], members: [], stages: [{ id: 'offer', label: 'Offerta' }], busy: false, errorKey: null, ...props },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(q('rule-dialog')).not.toBeNull())
  return wrapper
}

describe('rule dialog: trigger, conditions and preview', () => {
  it('saves a stuck rule with its days and conditions', async () => {
    const wrapper = await mountDialog()
    await select('rule-trigger', 'stage_stuck')
    expect(q<HTMLInputElement>('rule-trigger-days')?.value).toBe('5')
    await type('rule-trigger-days', '7')
    q<HTMLInputElement>('rule-source-careers_page')?.click()
    q<HTMLInputElement>('rule-consent-talent_pool')?.click()
    await type('rule-tags', 'Senior, remote')
    await select('rule-template', 't-update')
    q<HTMLFormElement>('rule-dialog')?.querySelector('form')?.requestSubmit()
    await flushPromises()
    expect(wrapper.emitted('save')?.[0]?.[0]).toEqual({
      stageId: 'tech',
      trigger: { type: 'stage_stuck', days: 7 },
      conditions: { sources: ['careers_page'], tags: ['senior', 'remote'], consentScopes: ['talent_pool'] },
      enabled: true,
      action: { type: 'send_template', templateId: 't-update' },
    })
  })

  it('shows an error for days out of range and does not save', async () => {
    const wrapper = await mountDialog()
    await select('rule-trigger', 'response_due_soon')
    await type('rule-trigger-days', '30')
    await select('rule-template', 't-update')
    q<HTMLFormElement>('rule-dialog')?.querySelector('form')?.requestSubmit()
    await flushPromises()
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(q('rule-dialog')?.textContent).toContain('Un numero intero da 1 a 14')
    expect(q<HTMLButtonElement>('rule-preview-run')?.disabled).toBe(true)
  })

  it('previews who the rule would act for, read-only, with the rule id when editing', async () => {
    await mountDialog({ rule: rule('r1', { stageId: 'tech', trigger: { type: 'stage_stuck', days: 3 } }) })
    q<HTMLButtonElement>('rule-preview-run')?.click()
    await vi.waitFor(() => expect(q('rule-preview-list')).not.toBeNull())
    expect(state.previews).toEqual([{ stageId: 'tech', trigger: { type: 'stage_stuck', days: 3 }, conditions: {}, ruleId: 'r1' }])
    expect(q('rule-preview-matching')?.textContent).toBe('2 candidature aperte in questa fase rispettano le condizioni.')
    expect(q('rule-preview-firing')?.textContent).toContain('agirebbe per 1 candidatura')
    expect(q('rule-preview-list')?.textContent).toContain('Anna Rossi')
    // Changing the rule forgets the answer.
    await type('rule-trigger-days', '4')
    expect(q('rule-preview-list')).toBeNull()
  })

  it('shows counts only when the names are not readable', async () => {
    state.items = false
    await mountDialog()
    q<HTMLButtonElement>('rule-preview-run')?.click()
    await vi.waitFor(() => expect(q('rule-preview-hidden')).not.toBeNull())
    expect(q('rule-preview-list')).toBeNull()
  })
})

describe('rule dialog: recent runs', () => {
  it('lists the runs of a saved rule with a link to the application', async () => {
    await mountDialog({ rule: rule('r1', { stageId: 'tech' }) })
    await vi.waitFor(() => expect(q('rule-runs-list')).not.toBeNull())
    expect(q('rule-runs-list')?.textContent).toContain('Anna Rossi')
    expect(q('rule-runs-list')?.textContent).toContain('candidatura ferma nella fase')
    expect(q('rule-runs-list')?.querySelector('a')?.getAttribute('href')).toBe('/app/candidates/c1?application=a1&viaJobId=j1')
  })

  it('says so when the rule has not run yet', async () => {
    state.runs = false
    await mountDialog({ rule: rule('r1', { stageId: 'tech' }) })
    await vi.waitFor(() => expect(q('rule-runs-empty')).not.toBeNull())
  })

  it('shows nothing for a rule that is not saved yet', async () => {
    await mountDialog()
    expect(q('rule-runs')).toBeNull()
  })
})

describe('rule dialog: the actions of part 2', () => {
  const submit = async () => {
    q<HTMLFormElement>('rule-dialog')?.querySelector('form')?.requestSubmit()
    await flushPromises()
  }

  it('proposes a move to another stage, and says a person confirms it', async () => {
    const wrapper = await mountDialog()
    await select('rule-action', 'propose_move')
    expect(q('rule-propose-note')?.textContent).toContain('una persona la conferma o la scarta')
    await submit()
    expect(wrapper.emitted('save')).toBeUndefined()
    await select('rule-to-stage', 'offer')
    await submit()
    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ stageId: 'tech', action: { type: 'propose_move', toStageId: 'offer' } })
  })

  it('alerts the job owner in the app, or sends a webhook event with nobody to choose', async () => {
    const wrapper = await mountDialog()
    await select('rule-action', 'notify')
    await submit()
    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ action: { type: 'notify', channel: 'in_app', recipients: ['job_owner'] } })
    await select('rule-channel', 'webhook')
    expect(q('rule-recipients')).toBeNull()
    await submit()
    expect(wrapper.emitted('save')?.[1]?.[0]).toMatchObject({ action: { type: 'notify', channel: 'webhook', recipients: [] } })
  })

  it('adds a tag, assigns, and asks for feedback', async () => {
    const wrapper = await mountDialog()
    await select('rule-action', 'add_tag')
    await type('rule-tag', ' Fast-Track ')
    await submit()
    await select('rule-action', 'assign')
    await submit()
    await select('rule-action', 'request_feedback')
    expect(q('rule-feedback-note')).not.toBeNull()
    await submit()
    expect(wrapper.emitted('save')?.map((event) => (event[0] as { action: unknown }).action)).toEqual([
      { type: 'add_tag', tag: 'fast-track' },
      { type: 'assign', assignee: 'job_owner' },
      { type: 'request_feedback' },
    ])
  })
})
