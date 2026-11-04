import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publicCandidate, publicShortlist } from '~~/test/fixtures/client-fixtures'
import { ok } from '~~/test/fixtures/job-fixtures'
import Page from './[token].vue'

const state = vi.hoisted(() => ({ body: null as unknown, answers: [] as unknown[], answerStatus: 200 }))
registerEndpoint('/api/v1/public/shortlists/good', { method: 'GET', handler: () => ok(state.body) })
registerEndpoint('/api/v1/public/shortlists/bad', {
  method: 'GET',
  handler: (event) => {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: { code: 'not_found', message: 'x' } }
  },
})
registerEndpoint('/api/v1/public/shortlists/good/answers', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<{ itemId: string; answer: 'meet' | 'not_for_us'; reason: string }>(event)
    state.answers.push(body)
    if (state.answerStatus !== 200) {
      setResponseStatus(event, state.answerStatus)
      return { success: false, data: null, error: { code: 'conflict', message: 'x' } }
    }
    return ok(publicCandidate(body.itemId, { answer: body.answer, answerReason: body.reason, answeredAt: '2026-10-14T10:00:00.000Z' }))
  },
})

const mounted: { unmount: () => void }[] = []
const mountPage = async (token: string) => {
  const wrapper = await mountSuspended(Page, { route: `/shortlist/${token}`, attachTo: document.body })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  state.body = publicShortlist()
  state.answers = []
  state.answerStatus = 200
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('public shortlist page', () => {
  it('shows the agency, the job, the message and what was shared of each candidate', async () => {
    const wrapper = await mountPage('good')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="shortlist-page"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="shortlist-agency"]').text()).toBe('Talenti Srl')
    expect(wrapper.find('[data-testid="shortlist-title"]').text()).toBe('Candidati per Backend developer')
    expect(wrapper.find('[data-testid="shortlist-message"]').text()).toContain('Ecco i profili')
    expect(wrapper.find('[data-testid="shortlist-decides"]').text()).toContain('una persona la legge')
    const [first, second] = wrapper.findAll('[data-testid="shortlist-candidate"]')
    expect(first!.text()).toContain('Molto chiara sulle aspettative.')
    expect(first!.find('[data-testid="shortlist-open-cv"]').attributes('href')).toBe('/api/v1/public/shortlists/good/candidates/i1/cv')
    expect(second!.find('[data-testid="shortlist-open-cv"]').exists()).toBe(false)
    expect(second!.text()).toContain('CV non condiviso')
    expect(wrapper.find('[data-testid="shortlist-progress"]').text()).toBe('0 su 2 con risposta')
  })

  it('asks for a choice and a reason, then shows the answer read-only', async () => {
    const wrapper = await mountPage('good')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="candidate-i1-submit"]').exists()).toBe(true))
    await wrapper.findAll('[data-testid="shortlist-answer-form"]')[0]!.trigger('submit')
    expect(wrapper.find('[data-testid="candidate-i1-issues"]').text()).toContain('Scegli una delle due risposte.')
    expect(wrapper.find('[data-testid="candidate-i1-issues"]').text()).toContain('Scrivi un motivo tra 3 e 500 caratteri.')
    expect(state.answers).toEqual([])
    await wrapper.find('[data-testid="candidate-i1-meet"] input').setValue(true)
    await wrapper.find('[data-testid="candidate-i1-reason"]').setValue('  Profilo molto solido  ')
    await wrapper.findAll('[data-testid="shortlist-answer-form"]')[0]!.trigger('submit')
    await vi.waitFor(() => expect(state.answers).toEqual([{ itemId: 'i1', answer: 'meet', reason: 'Profilo molto solido' }]))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="shortlist-answered"]').text()).toContain('Incontriamolo al colloquio'))
    expect(wrapper.find('[data-testid="shortlist-answered"]').text()).toContain('Profilo molto solido')
    expect(wrapper.find('[data-testid="shortlist-progress"]').text()).toBe('1 su 2 con risposta')
  })

  it('shows an answer already given without the form', async () => {
    state.body = publicShortlist({ candidates: [publicCandidate('i1', { answer: 'not_for_us', answerReason: 'Troppo junior', answeredAt: '2026-10-14T10:00:00.000Z' })] })
    const wrapper = await mountPage('good')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="shortlist-answered"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="shortlist-answered"]').text()).toContain('Non fa per noi')
    expect(wrapper.find('[data-testid="shortlist-answer-form"]').exists()).toBe(false)
  })

  it('says when the candidate was already answered elsewhere', async () => {
    state.answerStatus = 409
    const wrapper = await mountPage('good')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="candidate-i1-submit"]').exists()).toBe(true))
    await wrapper.find('[data-testid="candidate-i1-not_for_us"] input').setValue(true)
    await wrapper.find('[data-testid="candidate-i1-reason"]').setValue('Non in linea')
    await wrapper.findAll('[data-testid="shortlist-answer-form"]')[0]!.trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="candidate-i1-issues"]').text()).toContain('una risposta è già stata inviata'))
  })

  it('says the link is not valid or has expired', async () => {
    const wrapper = await mountPage('bad')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="shortlist-failure"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="shortlist-failure"]').attributes('data-failure')).toBe('invalid')
    expect(wrapper.text()).toContain('Questo link non è valido o è scaduto')
    expect(wrapper.find('[data-testid="shortlist-candidate"]').exists()).toBe(false)
  })
})
