import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import TalentPoolSearchPanel from './TalentPoolSearchPanel.vue'

const anna = { candidateId: 'c1', fullName: 'Anna Rossi', appliedToThisJob: false, lastAppliedAt: '2026-09-02T10:00:00.000Z', skillMatches: [{ criterion: 'Go', matchedAs: 'Golang' }] }
const luca = { candidateId: 'c2', fullName: 'Luca Neri', appliedToThisJob: true, lastAppliedAt: null, skillMatches: [] }
const state = vi.hoisted(() => ({ searches: [] as unknown[], fail: false, total: 2 }))
registerEndpoint('/api/v1/jobs/j1/talent-pool/search', async (event) => {
  state.searches.push(await readBody(event))
  if (state.fail) {
    setResponseStatus(event, 422)
    return { success: false, data: null, error: { code: 'validation_failed', message: 'criteria_discriminatory' } }
  }
  return ok({ order: 'most recent application first; not a ranking', criteria: ['Go', 'Milano'], total: state.total, notEvaluable: 3, page: 1, limit: 25, people: [anna, luca] })
})

const mounted: { unmount: () => void }[] = []
beforeEach(() => {
  state.searches = []
  state.fail = false
  state.total = 2
  useViewer().viewer.value = viewerWith('recruiter')
  clearNuxtState()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

const mountPanel = async () => {
  const wrapper = await mountSuspended(TalentPoolSearchPanel, { props: { jobId: 'j1', city: 'Milano', technologies: ['Go', 'Kubernetes', 'Postgres', 'Redis'] } })
  mounted.push(wrapper)
  return wrapper
}

describe('talent pool search of a job', () => {
  it('prefills the ad, searches the talent pool, and lists who meets every criterion with a link to the profile', async () => {
    const wrapper = await mountPanel()
    expect((wrapper.find('[data-testid="talent-search-skills"]').element as HTMLInputElement).value).toBe('Go, Kubernetes, Postgres')
    await wrapper.find('[data-testid="talent-search-skills"]').setValue('Go')
    await wrapper.find('[data-testid="talent-search-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="talent-search-results"]').exists()).toBe(true))
    expect(state.searches).toEqual([{ criteria: { skills: ['Go'], languages: [], locations: ['Milano'], keywords: [] }, page: 1 }])
    const people = wrapper.findAll('[data-testid="talent-search-person"]')
    expect(people.map((link) => link.text())).toEqual(['Anna Rossi', 'Luca Neri'])
    expect(people[0]!.attributes('href')).toBe('/app/candidates/c1')
    const text = wrapper.text()
    expect(text).toContain('Golang')
    expect(text).toContain('Già candidato a questo annuncio')
    expect(wrapper.find('[data-testid="talent-search-unchecked"]').text()).toContain('3 CV')
    expect(wrapper.find('[data-testid="talent-search-next"]').exists()).toBe(false)
  })

  it('asks for a criterion before calling the api, and says when the criteria are refused', async () => {
    const wrapper = await mountPanel()
    for (const id of ['talent-search-skills', 'talent-search-location']) await wrapper.find(`[data-testid="${id}"]`).setValue('')
    await wrapper.find('[data-testid="talent-search-form"]').trigger('submit')
    await flushPromises()
    expect(state.searches).toEqual([])
    expect(wrapper.find('[data-testid="talent-search-error"]').text()).toContain('almeno un criterio')
    state.fail = true
    await wrapper.find('[data-testid="talent-search-keywords"]').setValue('donna')
    await wrapper.find('[data-testid="talent-search-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="talent-search-error"]').text()).toContain('caratteristiche personali'))
  })

  it('pages through more than 25 people', async () => {
    state.total = 60
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="talent-search-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="talent-search-next"]').exists()).toBe(true))
    await wrapper.find('[data-testid="talent-search-next"]').trigger('click')
    await vi.waitFor(() => expect(state.searches).toHaveLength(2))
    expect(state.searches[1]).toMatchObject({ page: 2 })
  })
})
