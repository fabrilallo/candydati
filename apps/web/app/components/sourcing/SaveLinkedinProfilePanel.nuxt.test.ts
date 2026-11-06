import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { getQuery, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { jobSummary } from '~~/test/fixtures/phase8-fixtures'
import SavePage from '@/pages/app/sourcing/save.vue'
import SaveLinkedinProfilePanel from './SaveLinkedinProfilePanel.vue'

const PROFILE = { profileUrl: 'https://www.linkedin.com/in/giulia-verdi/', fullName: 'Giulia Verdi', headline: 'Backend engineer at Acme', location: 'Torino, Piemonte, Italia', text: '' }
const state = vi.hoisted(() => ({ outcome: 'added', posts: [] as unknown[], posted: [] as string[], jobQueries: [] as unknown[] }))
registerEndpoint('/api/v1/jobs', (event) => (state.jobQueries.push(getQuery(event)), ok([jobSummary('j1', 'Backend developer'), jobSummary('j2', 'Frontend developer')], { total: 2, page: 1, limit: 100 })))
registerEndpoint('/api/v1/jobs/j2/sourced-contacts', {
  method: 'POST',
  handler: async (event) => {
    state.posted.push('j2')
    state.posts.push(await readBody(event))
    return ok([{ profileUrl: PROFILE.profileUrl, outcome: state.outcome, contactId: 'c1', candidateId: null, noticeUrl: null }])
  },
})

const messages: unknown[] = []
const fakeChrome = (answer: unknown) => ({ runtime: { sendMessage: (_id: string, message: unknown, callback: (response: unknown) => void) => (messages.push(message), callback(answer)) } })

const mounted: { unmount: () => void }[] = []
const el = (wrapper: { find: (selector: string) => { exists: () => boolean } }, testId: string) => wrapper.find(`[data-testid="${testId}"]`)
const mountPanel = async () => {
  const wrapper = await mountSuspended(SaveLinkedinProfilePanel, { attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
beforeEach(() => {
  state.outcome = 'added'
  state.posts = []
  state.posted = []
  state.jobQueries = []
  messages.length = 0
  useRuntimeConfig().public.extensionId = 'ext-id'
  useViewer().viewer.value = viewerWith('recruiter')
  ;(globalThis as { chrome?: unknown }).chrome = fakeChrome({ ok: true, profile: PROFILE })
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  delete (globalThis as { chrome?: unknown }).chrome
})

describe('save a LinkedIn profile', () => {
  it('shows the person from the extension and adds them to the chosen open position', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="linkedin-save-name"]').text()).toBe('Giulia Verdi'))
    expect(messages).toEqual([{ type: 'candydati.pending_profile' }])
    expect(state.jobQueries).toEqual([{ status: 'published', page: '1', limit: '100' }])
    expect(wrapper.find('[data-testid="linkedin-save-person"]').text()).toContain('Torino, Piemonte, Italia')
    expect(wrapper.find('[data-testid="linkedin-save-profile"]').attributes('rel')).toContain('noopener')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Scegli la posizione')
    expect(state.posts).toEqual([])
    await wrapper.find('[data-testid="linkedin-save-job"]').setValue('j2')
    await wrapper.find('[data-testid="linkedin-save-evidence"]').setValue('Go: 4 anni in Acme')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="linkedin-save-result"]').text()).toContain('Contatto aggiunto'))
    expect(state.posted).toEqual(['j2'])
    expect(state.posts).toEqual([{ contacts: [{ firstName: 'Giulia', lastName: 'Verdi', headline: 'Backend engineer at Acme', location: 'Torino, Piemonte, Italia', source: 'linkedin', profileUrl: PROFILE.profileUrl, evidence: [{ criterion: 'Go', text: '4 anni in Acme' }] }] }])
    expect(wrapper.find('[data-testid="linkedin-save-open-job"]').attributes('href')).toBe('/app/jobs/j2/sourcing')
  })

  it('says when the person asked not to be contacted again', async () => {
    state.outcome = 'objected'
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(el(wrapper, 'linkedin-save-job').exists()).toBe(true))
    await wrapper.find('[data-testid="linkedin-save-job"]').setValue('j2')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="linkedin-save-result"]').text()).toContain('non essere ricontattata'))
  })

  it('explains an empty hand-off, a missing extension and a wrong answer', async () => {
    ;(globalThis as { chrome?: unknown }).chrome = fakeChrome({ ok: true, profile: null })
    const empty = await mountPanel()
    await vi.waitFor(() => expect(el(empty, 'linkedin-save-empty').exists()).toBe(true))
    delete (globalThis as { chrome?: unknown }).chrome
    const missing = await mountPanel()
    await vi.waitFor(() => expect(el(missing, 'linkedin-save-extension_missing').exists()).toBe(true))
    ;(globalThis as { chrome?: unknown }).chrome = fakeChrome({ ok: true, profile: { fullName: 'x' } })
    const failed = await mountPanel()
    await vi.waitFor(() => expect(el(failed, 'linkedin-save-failed').exists()).toBe(true))
    await flushPromises()
  })

  it('the page shows the panel only to someone who may source', async () => {
    const page = await mountSuspended(SavePage, { route: '/app/sourcing/save' })
    mounted.push(page)
    expect(page.find('[data-testid="linkedin-save-panel"]').exists()).toBe(true)
    useViewer().viewer.value = viewerWith('interviewer')
    const denied = await mountSuspended(SavePage, { route: '/app/sourcing/save' })
    mounted.push(denied)
    expect(denied.find('[data-testid="linkedin-save-panel"]').exists()).toBe(false)
  })
})
