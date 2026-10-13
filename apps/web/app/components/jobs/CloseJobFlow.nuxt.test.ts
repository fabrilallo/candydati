import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { card, pipeline } from '~~/test/fixtures/candidate-fixtures'
import { makeJob, ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { TEMPLATES } from '~~/test/fixtures/message-fixtures'
import JobEditor from './JobEditor.vue'

const state = vi.hoisted(() => ({ open: [] as string[], calls: [] as string[], decided: [] as unknown[], refuseClose: 0 }))
registerEndpoint('/api/v1/jobs/j1/pipeline', () => ok(pipeline([...state.open.map((id) => card(id)), card('done', 'stage-1', { outcome: 'hired', closedAt: '2026-10-12T10:00:00.000Z' })])))
registerEndpoint('/api/v1/applications/decide', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<{ applicationIds: string[] }>(event)
    state.decided.push(body)
    state.open = []
    return ok({ decided: body.applicationIds.length })
  },
})
registerEndpoint('/api/v1/jobs/j1/close', {
  method: 'POST',
  handler: (event) => {
    state.calls.push('close')
    if (state.refuseClose > 0) {
      setResponseStatus(event, 422)
      return { success: false, data: null, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'applications', message: `open_applications:${state.refuseClose}` }] } }
    }
    return ok(makeJob({ status: 'closed', closedAt: '2026-10-14T10:00:00.000Z' }))
  },
})
registerEndpoint('/api/v1/email-templates', () => ok(TEMPLATES))
registerEndpoint('/api/v1/email-templates/preview', { method: 'POST', handler: () => ok({ subject: 'S', body: 'B', unknownVariables: [] }) })

const mounted: { unmount: () => void }[] = []
const byTestId = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
/** Clicks once the button is there and no longer waiting for the fresh count. */
const press = async (id: string): Promise<void> => {
  await vi.waitFor(() => expect(byTestId(id)?.hasAttribute('disabled')).toBe(false))
  byTestId(id)?.click()
}
const startClose = async () => {
  const wrapper = await mountSuspended(JobEditor, { props: { job: makeJob({ status: 'published', publishedAt: '2026-10-13T11:00:00.000Z' }), template: null } })
  mounted.push(wrapper)
  await wrapper.find('[data-testid="more-actions"]').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  byTestId('close-job')?.click()
  return wrapper
}
beforeEach(() => {
  state.open = ['a1', 'a2']
  state.calls.length = 0
  state.decided.length = 0
  state.refuseClose = 0
  clearNuxtData()
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('closing a job with open applications', () => {
  it('counts the open ones, decides them as Not selected, proposes the outcome message, then closes', async () => {
    const wrapper = await startClose()
    await vi.waitFor(() => expect(byTestId('close-open-title')?.textContent).toBe('2 candidature sono ancora aperte'))
    expect(byTestId('confirm')).toBeNull()
    expect(byTestId('close-review')?.getAttribute('href')).toBe('/app/jobs/j1/candidates')
    await press('close-decide-all')
    await vi.waitFor(() => expect(state.decided).toEqual([{ applicationIds: ['a1', 'a2'], outcome: 'not_selected' }]))
    await vi.waitFor(() => expect(byTestId('bulk-composer')?.textContent).toContain('2 destinatari'))
    await vi.waitFor(() => expect(document.body.querySelector<HTMLInputElement>('[data-testid="composer-subject"]')?.value).not.toBe(''))
    expect(state.calls).toEqual([])
    byTestId('composer-skip')?.click()
    await vi.waitFor(() => expect(state.calls).toEqual(['close']))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="readonly-note"]').text()).toContain('chiuso'))
  })

  it('closes at once with a plain confirmation when nothing is open', async () => {
    state.open = []
    const wrapper = await startClose()
    await press('confirm')
    await vi.waitFor(() => expect(state.calls).toEqual(['close']))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="readonly-note"]').exists()).toBe(true))
  })

  it('shows the same flow when the api refuses with open_applications', async () => {
    state.open = []
    state.refuseClose = 1
    await startClose()
    await vi.waitFor(() => expect(byTestId('confirm')?.hasAttribute('disabled')).toBe(false))
    state.open = ['late']
    await press('confirm')
    await vi.waitFor(() => expect(state.calls).toEqual(['close']))
    await vi.waitFor(() => expect(byTestId('close-open-title')?.textContent).toBe('Una candidatura è ancora aperta'))
  })
})
