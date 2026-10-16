import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { setResponseStatus, type H3Event } from 'h3'
import { defaultCareersPage, type PublicCareersDto, type PublicCareersPageDto, type PublishedJobContent, type PublicJobPage } from '@candydati/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeContent, ok } from '~~/test/fixtures/job-fixtures'
import { publicConsent } from '~~/test/fixtures/phase8-fixtures'
import CareersIndex from './careers/[org]/index.vue'
import CareersJob from './careers/[org]/[job].vue'
import ConsentPage from './consent/[token].vue'

const state = vi.hoisted(() => ({ careers: 'ok' as 'ok' | 'missing' | 'down', site: 'ok' as 'ok' | 'down', consent: 'ok' as 'ok' | 'gone' | 'invalid' | 'down' }))

const careers: PublicCareersDto = { organization: { name: 'Officina Dati', slug: 'officina', logo: null }, jobs: [] }
const jobPage: PublicJobPage = {
  organization: { name: 'Officina Dati', slug: 'officina', logo: null },
  job: { slug: 'backend-1', content: completeContent as PublishedJobContent, publishedAt: '2026-10-13T10:00:00.000Z', updatedAt: '2026-10-13T10:00:00.000Z' },
  privacyNotice: null,
}

const fail = (event: H3Event, status: number, code: string) => {
  setResponseStatus(event, status)
  return { success: false, data: null, error: { code, message: code } }
}

registerEndpoint('/api/v1/public/organizations/officina/jobs', (event) => {
  if (state.careers === 'missing') return fail(event, 404, 'not_found')
  if (state.careers === 'down') return fail(event, 500, 'internal')
  return ok(careers)
})
const site: PublicCareersPageDto = {
  organization: careers.organization,
  page: { ...defaultCareersPage('Officina Dati'), sections: [{ ...defaultCareersPage('Officina Dati').sections[0]!, headline: { it: 'Costruiamo dati che contano' } } as PublicCareersPageDto['page']['sections'][number], defaultCareersPage('Officina Dati').sections[1]!] },
  media: {},
  publishedAt: '2026-10-13T10:00:00.000Z',
}
registerEndpoint('/api/v1/public/organizations/officina/careers-page', (event) => (state.site === 'ok' ? ok(site) : fail(event, 500, 'internal')))
registerEndpoint('/api/v1/public/organizations/officina/jobs/backend-1', (event) => (state.careers === 'ok' ? ok(jobPage) : fail(event, 404, 'not_found')))
registerEndpoint('/api/v1/public/consent/good', (event) => {
  if (state.consent === 'gone') return fail(event, 410, 'expired')
  if (state.consent === 'invalid') return fail(event, 404, 'not_found')
  if (state.consent === 'down') return fail(event, 500, 'internal')
  return ok(publicConsent())
})

const mounted: { unmount: () => void }[] = []
const mountPage = async (component: Parameters<typeof mountSuspended>[0], route: string) => {
  const wrapper = await mountSuspended(component, { route, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
beforeEach(() => {
  state.careers = 'ok'
  state.site = 'ok'
  state.consent = 'ok'
  clearNuxtData()
  clearError()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('careers index page', () => {
  it('lists the organization with its title', async () => {
    const wrapper = await mountPage(CareersIndex, '/careers/officina')
    expect(wrapper.text()).toContain('Officina Dati')
  })

  it('renders the published page of the organization', async () => {
    const wrapper = await mountPage(CareersIndex, '/careers/officina')
    expect(wrapper.find('h1').text()).toBe('Costruiamo dati che contano')
    expect(wrapper.find('[data-testid="site-jobs"]').exists()).toBe(true)
  })

  it('falls back to the default page when the page document cannot be read', async () => {
    state.site = 'down'
    const wrapper = await mountPage(CareersIndex, '/careers/officina')
    expect(wrapper.find('h1').text()).toBe('Posizioni aperte in Officina Dati')
    expect(useError().value).toBeFalsy()
  })

  it('throws a 404 for an unknown organization', async () => {
    state.careers = 'missing'
    await mountPage(CareersIndex, '/careers/officina').catch(() => undefined)
    expect(useError().value).toMatchObject({ statusCode: 404 })
  })

  it('throws a 503 when the api is down', async () => {
    state.careers = 'down'
    await mountPage(CareersIndex, '/careers/officina').catch(() => undefined)
    expect(useError().value).toMatchObject({ statusCode: 503 })
  })
})

describe('public job ad page', () => {
  it('shows the ad', async () => {
    const wrapper = await mountPage(CareersJob, '/careers/officina/backend-1')
    expect(wrapper.text()).toContain(completeContent.title)
  })

  it('throws a 404 for an ad that is not published', async () => {
    state.careers = 'missing'
    await mountPage(CareersJob, '/careers/officina/backend-1').catch(() => undefined)
    expect(useError().value).toMatchObject({ statusCode: 404 })
  })
})

describe('consent page', () => {
  it('shows who asks, for which job and the deadline', async () => {
    const wrapper = await mountPage(ConsentPage, '/consent/good')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="reconfirm-page"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="reconfirm-intro"]').text()).toContain('Data Engineer')
    expect(wrapper.find('[data-testid="reconfirm-deadline"]').exists()).toBe(true)
  })

  it.each([
    ['gone', 'expired'],
    ['invalid', 'invalid'],
    ['down', 'unavailable'],
  ] as const)('explains a link that does not work (%s)', async (kind, failure) => {
    state.consent = kind
    const wrapper = await mountPage(ConsentPage, '/consent/good')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="reconfirm-failure"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="reconfirm-failure"]').attributes('data-failure')).toBe(failure)
    expect(wrapper.find('h1').text()).not.toBe('')
  })
})
