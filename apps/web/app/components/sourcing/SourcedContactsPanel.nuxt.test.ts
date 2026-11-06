import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { getQuery, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourcedContactDto } from '@candydati/domain'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import SourcedContactsPanel from './SourcedContactsPanel.vue'

const contact = (id: string, overrides: Partial<SourcedContactDto> = {}): SourcedContactDto => ({
  id, jobId: 'j1', firstName: 'Maja', lastName: 'Lind', headline: 'Backend engineer', location: 'Stockholm', source: 'linkedin', profileUrl: 'https://www.linkedin.com/in/maja',
  email: null, evidence: [{ criterion: 'Go', text: '4 anni in Spotify', where: null }], status: 'found', noticeSentAt: null, contactedAt: null,
  expiresAt: new Date(Date.now() + 10 * 86_400_000 - 60_000).toISOString(), createdBy: 'u1', createdAt: new Date().toISOString(), ...overrides,
})
const state = vi.hoisted(() => ({ list: [] as unknown[], posts: [] as unknown[], contacted: 0, deletes: [] as unknown[] }))
registerEndpoint('/api/v1/jobs/j1/sourced-contacts', async (event) => {
  if (event.method !== 'POST') return ok(state.list)
  const body = await readBody<{ contacts: { profileUrl: string }[] }>(event)
  state.posts.push(body)
  return ok([{ profileUrl: body.contacts[0]?.profileUrl, outcome: 'added', contactId: 'c9', candidateId: null, noticeUrl: 'https://x/sourcing/notice/s' }])
})
registerEndpoint('/api/v1/sourced-contacts/c1/notice', { method: 'POST', handler: () => ok({ text: 'Informativa privacy: … https://app/sourcing/notice/abc', url: 'https://app/sourcing/notice/abc' }) })
registerEndpoint('/api/v1/sourced-contacts/c1/contacted', { method: 'POST', handler: () => (state.contacted++, ok(contact('c1', { status: 'contacted' }))) })
registerEndpoint('/api/v1/sourced-contacts/c1', { method: 'DELETE', handler: (event) => (state.deletes.push(getQuery(event)), ok({ deleted: true })) })

const mounted: { unmount: () => void }[] = []
const el = (testId: string) => document.body.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
const mountPanel = async () => {
  const wrapper = await mountSuspended(SourcedContactsPanel, { props: { jobId: 'j1' }, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
beforeEach(() => {
  state.list = [contact('c1')]
  state.posts = []
  state.contacted = 0
  state.deletes = []
  clearNuxtData()
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('sourced contacts of a job', () => {
  it('shows who, from where, the evidence and when the contact is erased, with the profile opened safely', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="contact-name"]').text()).toBe('Maja Lind'))
    expect(wrapper.find('[data-testid="contact-evidence"]').text()).toContain('Go: 4 anni in Spotify')
    expect(wrapper.find('[data-testid="contact-expiry"]').text()).toBe('Cancellato tra 10 giorni')
    expect(wrapper.find('[data-testid="contact-profile"]').attributes('rel')).toContain('noopener')
    expect(wrapper.find('[data-testid="sourcing-note"]').text()).toContain('art. 14')
  })

  it('gives the notice text for a first message and marks the contact as written to', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="contact-notice"]').exists()).toBe(true))
    await wrapper.find('[data-testid="contact-notice"]').trigger('click')
    await vi.waitFor(() => expect((el('notice-text') as HTMLTextAreaElement | null)?.value).toContain('https://app/sourcing/notice/abc'))
    el('notice-contacted')?.click()
    await vi.waitFor(() => expect(state.contacted).toBe(1))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="contact-status"]').text()).toBe('Contattato'))
  })

  it('adds a contact by hand only with a name and a profile link', async () => {
    state.list = []
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="sourcing-empty"]').exists()).toBe(true))
    await wrapper.find('[data-testid="contact-add"]').trigger('click')
    await vi.waitFor(() => expect(el('add-contact-dialog')).not.toBeNull())
    document.body.querySelector<HTMLFormElement>('#add-contact-form')?.requestSubmit()
    await vi.waitFor(() => expect(el('add-contact-dialog')?.textContent).toContain('Incolla il link al profilo'))
    for (const [id, value] of [['contact-first-name', 'Ada'], ['contact-profile-url', 'https://github.com/ada'], ['contact-evidence-input', 'Go: 3 repository']] as const) {
      const input = el(id) as HTMLInputElement
      input.value = value
      input.dispatchEvent(new Event('input'))
    }
    const source = el('contact-source') as HTMLSelectElement
    source.value = 'github'
    source.dispatchEvent(new Event('change'))
    await flushPromises()
    document.body.querySelector<HTMLFormElement>('#add-contact-form')?.requestSubmit()
    await vi.waitFor(() => expect(state.posts).toEqual([{ contacts: [{ firstName: 'Ada', lastName: null, headline: null, location: null, source: 'github', profileUrl: 'https://github.com/ada', evidence: [{ criterion: 'Go', text: '3 repository' }] }] }]))
  })

  it('erases a contact, and with "do not contact again" asks the api to remember it', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="contact-delete"]').exists()).toBe(true))
    await wrapper.find('[data-testid="contact-delete"]').trigger('click')
    await vi.waitFor(() => expect(el('delete-contact-dialog')).not.toBeNull())
    el('delete-do-not-contact')?.click()
    el('delete-contact-confirm')?.click()
    await vi.waitFor(() => expect(state.deletes).toEqual([{ doNotContact: 'true' }]))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="sourced-contact"]').exists()).toBe(false))
  })
})
