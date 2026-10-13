import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { jobRequest } from '~~/test/fixtures/job-request-fixtures'
import JobRequestForm from './JobRequestForm.vue'

const state = vi.hoisted(() => ({ posted: [] as unknown[] }))
registerEndpoint('/api/v1/job-requests', {
  method: 'POST',
  handler: async (event) => {
    state.posted.push(await readBody(event))
    return ok(jobRequest('r9'))
  },
})

const mounted: { unmount: () => void }[] = []
const mountForm = async (title?: string) => {
  const wrapper = await mountSuspended(JobRequestForm, { props: { title }, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
beforeEach(() => {
  state.posted.length = 0
  useViewer().viewer.value = viewerWith('hiring_manager')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('job request form', () => {
  it('prefills the title and shows what is missing without sending', async () => {
    const wrapper = await mountForm('Data engineer')
    expect(wrapper.find<HTMLInputElement>('[data-testid="req-title"]').element.value).toBe('Data engineer')
    await wrapper.find('[data-testid="request-form"]').trigger('submit')
    await flushPromises()
    const alerts = wrapper.findAll('[role="alert"]').map((node) => node.text())
    expect(alerts).toContain('Scegli il ruolo.')
    expect(alerts).toContain('Spiega in poche parole perché serve questa persona.')
    expect(alerts).toContain('Indica la RAL minima.')
    expect(state.posted).toHaveLength(0)
  })

  it('rejects a maximum below the minimum', async () => {
    const wrapper = await mountForm('Dev')
    await wrapper.find('#req-role').setValue('backend_developer')
    await wrapper.find('[data-testid="req-reason"]').setValue('Serve')
    await wrapper.find('#req-salary-min').setValue('70000')
    await wrapper.find('#req-salary-max').setValue('60000')
    await wrapper.find('[data-testid="request-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('La RAL massima non può essere sotto la minima.')
    expect(state.posted).toHaveLength(0)
  })

  it('sends a valid request as numbers', async () => {
    const wrapper = await mountForm('Backend developer')
    await wrapper.find('#req-role').setValue('backend_developer')
    await wrapper.find('[data-testid="req-reason"]').setValue('Il team ha perso due persone.')
    await wrapper.find('[data-testid="req-headcount"]').setValue('2')
    await wrapper.find('#req-salary-min').setValue('45000')
    await wrapper.find('#req-salary-max').setValue('60000')
    await wrapper.find('[data-testid="request-form"]').trigger('submit')
    await vi.waitFor(() => expect(state.posted).toHaveLength(1))
    expect(state.posted[0]).toEqual({ title: 'Backend developer', role: 'backend_developer', reason: 'Il team ha perso due persone.', headcount: 2, salaryMin: 45000, salaryMax: 60000, currency: 'EUR' })
  })
})
