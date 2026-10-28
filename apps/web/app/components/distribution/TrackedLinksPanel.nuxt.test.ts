import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import type { PipelineDto, TrackedLinkDto } from '@candydati/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import { card, pipeline } from '~~/test/fixtures/candidate-fixtures'
import TrackedLinksPanel from './TrackedLinksPanel.vue'

const JOB = 'https://jobs.example.com/careers/acme/backend-1'
const link = (id: string, source: string, campaign = ''): TrackedLinkDto => ({ id, jobId: 'job-1', source, campaign, createdAt: '2026-10-01T10:00:00.000Z' })

const state = vi.hoisted(() => ({ links: [] as unknown[], posts: [] as unknown[], deletes: [] as string[], failList: false }))
registerEndpoint('/api/v1/jobs/job-1/tracked-links', {
  method: 'GET',
  handler: () => (state.failList ? { success: false, data: null, error: { code: 'internal', message: 'x' } } : ok(state.links)),
})
registerEndpoint('/api/v1/jobs/job-1/tracked-links', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<{ source: string; campaign: string }>(event)
    state.posts.push(body)
    return ok({ link: link(`tl-${state.posts.length + 1}`, body.source, body.campaign), created: true })
  },
})
registerEndpoint('/api/v1/jobs/job-1/tracked-links/tl-1', {
  method: 'DELETE',
  handler: () => {
    state.deletes.push('tl-1')
    return ok({ removed: true })
  },
})

const mounted: { unmount: () => void }[] = []
const board = (): PipelineDto =>
  pipeline([
    card('a1', 'received', { origin: 'linkedin', campaign: 'autumn' }),
    card('a2', 'stage-0', { origin: 'linkedin', campaign: 'autumn' }),
    card('a3', 'received', { origin: 'indeed', campaign: null }),
  ])
const mountPanel = async (props: { jobUrl?: string | null; pipeline?: PipelineDto | null } = {}) => {
  const wrapper = await mountSuspended(TrackedLinksPanel, {
    props: { jobId: 'job-1', jobUrl: props.jobUrl === undefined ? JOB : props.jobUrl, pipeline: props.pipeline ?? null },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  state.links = [link('tl-1', 'linkedin'), link('tl-2', 'linkedin', 'autumn'), link('tl-3', 'fiera-bologna')]
  state.posts = []
  state.deletes = []
  state.failList = false
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('TrackedLinksPanel', () => {
  it('lists every saved link with its URL, copy button and the applications that came through it', async () => {
    const wrapper = await mountPanel({ pipeline: board() })
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="tracked-link-row"]')).toHaveLength(3))
    const names = wrapper.findAll('[data-testid="tracked-link-name"]').map((name) => name.text())
    expect(names).toEqual(['LinkedIn', 'LinkedIn · autumn', 'fiera-bologna'])
    const urls = wrapper.findAll('[data-testid="tracked-link-saved-url"]').map((url) => url.text())
    expect(urls).toEqual([`${JOB}?utm_source=linkedin`, `${JOB}?utm_source=linkedin&utm_campaign=autumn`, `${JOB}?utm_source=fiera-bologna`])
    const counts = wrapper.findAll('[data-testid="tracked-link-applications"]').map((count) => count.text())
    expect(counts).toEqual(['Nessuna candidatura', '2 candidature', 'Nessuna candidatura'])
    expect(wrapper.find('button[aria-label="Copia il link per LinkedIn · autumn"]').exists()).toBe(true)
    const people = wrapper.findAll('[data-testid="tracked-link-people"]')
    expect(people).toHaveLength(1)
    expect(people[0]!.find('summary').text()).toBe('Vedi chi si è candidato da LinkedIn · autumn')
    expect(people[0]!.findAll('[data-testid="source-application"] a').map((a) => a.attributes('href'))).toEqual([
      '/app/candidates/c-a1?application=a1&viaJobId=job-1',
      '/app/candidates/c-a2?application=a2&viaJobId=job-1',
    ])
  })

  it('shows no count and no names without access to candidates', async () => {
    const wrapper = await mountPanel({ pipeline: null })
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="tracked-link-row"]')).toHaveLength(3))
    expect(wrapper.find('[data-testid="tracked-link-applications"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tracked-link-people"]').exists()).toBe(false)
  })

  it('saves a new link and shows it in the list', async () => {
    state.links = []
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="tracked-links-none"]').exists()).toBe(true))
    await wrapper.find('#tracked-channel').setValue('indeed')
    await wrapper.find('#tracked-campaign').setValue('Spring')
    await wrapper.find('[data-testid="tracked-link-save"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="tracked-link-row"]')).toHaveLength(1))
    expect(state.posts).toEqual([{ source: 'indeed', campaign: 'spring' }])
    expect(wrapper.find('[data-testid="tracked-link-name"]').text()).toBe('Indeed · spring')
    expect(wrapper.find('[data-testid="tracked-link-applications"]').exists()).toBe(false)
  })

  it('removes a link', async () => {
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="tracked-link-row"]')).toHaveLength(3))
    await wrapper.find('button[aria-label="Rimuovi il link per LinkedIn"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="tracked-link-row"]')).toHaveLength(2))
    expect(state.deletes).toEqual(['tl-1'])
  })

  it('keeps the saved channels without URLs while the ad is not published', async () => {
    const wrapper = await mountPanel({ jobUrl: null })
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="tracked-link-row"]')).toHaveLength(3))
    expect(wrapper.find('[data-testid="tracked-link-saved-url"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tracked-links-unpublished"]').exists()).toBe(true)
  })

  it('says when the saved links could not be read', async () => {
    state.failList = true
    const wrapper = await mountPanel()
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="tracked-links-saved"]').exists()).toBe(false)
  })
})
