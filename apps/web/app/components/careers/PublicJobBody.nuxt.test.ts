import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { PublishedJobContent, PublicJobPage  } from '@candydati/domain'
import { publicNotice } from '~~/test/fixtures/candidate-fixtures'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { completeContent } from '~~/test/fixtures/job-fixtures'
import CareersList from './CareersList.vue'
import PublicJobBody from './PublicJobBody.vue'

const page = (overrides: Partial<PublishedJobContent> = {}, logo: string | null = null, privacyNotice: PublicJobPage['privacyNotice'] = null): PublicJobPage => ({
  organization: { name: 'Acme', slug: 'acme', logo },
  job: { slug: 'backend-1', content: { ...(completeContent as PublishedJobContent), ...overrides }, publishedAt: '2026-10-13T10:00:00.000Z', updatedAt: '2026-10-13T10:00:00.000Z' },
  privacyNotice,
})

describe('PublicJobBody', () => {
  beforeAll(async () => {
    await useNuxtApp().$i18n.loadLocaleMessages('en')
  })

  it('puts the salary range and the number of stages first, then the quieter facts, with no times', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page() } })
    const facts = Object.fromEntries(wrapper.findAll('[data-fact]').map((node) => [node.attributes('data-fact'), node.text()]))
    expect(Object.keys(facts)).toEqual(['salary', 'process', 'contract', 'seniority', 'workMode', 'location'])
    expect(facts.salary).toContain('RAL lorda')
    expect(facts.salary).toContain('45.000 - 60.000 €')
    expect(facts.process).toContain('2 fasi')
    expect(facts.process).not.toContain('circa')
    expect(wrapper.find('[data-testid="job-facts"]').text()).not.toContain('entro 5 giorni')
    expect(facts.contract).toContain('Tempo indeterminato')
    expect(facts.workMode).toContain('Ibrido')
    expect(facts.workMode).toContain('2 giorni a settimana in sede')
    expect(facts.location).toContain('Milano, Italia')
  })

  it('names the gross period when the salary is not yearly', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page({ salary: { min: 3000, max: 3500, currency: 'EUR', period: 'month' } }) } })
    const salary = wrapper.find('[data-fact="salary"]').text()
    expect(salary).toContain('lordi al mese')
    expect(salary).toContain('3.000 - 3.500 €')
  })

  it('lists the selection process in order with duration and who conducts it, without the response time', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page() } })
    const stages = wrapper.findAll('[data-testid="job-stage"]').map((node) => node.text())
    expect(stages).toHaveLength(2)
    expect(stages[0]).toContain('Chiamata conoscitiva')
    expect(stages[0]).toContain('30 min')
    expect(stages[0]).toContain('Con: Recruiter')
    expect(stages[1]).toContain('Colloquio tecnico')
    expect(stages[1]).toContain('1 h 30 min')
    expect(stages[1]).toContain('Con: Responsabile tecnico')
    expect(stages[1]).toContain('Pair su un problema reale')
    expect(wrapper.find('[data-testid="process-summary"]').text()).toBe('2 fasi')
    expect(wrapper.find('[data-testid="job-process"] ol').exists()).toBe(true)
    expect(wrapper.find('[data-testid="job-response-time"]').exists()).toBe(false)
  })

  it('names a stage by its title when it has one, otherwise by its type', async () => {
    const [first, second] = completeContent.process
    const process = [{ ...first!, title: 'Una chiacchierata' }, second!]
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page({ process }) } })
    const stages = wrapper.findAll('[data-testid="job-stage"]').map((node) => node.text())
    expect(stages[0]).toContain('Una chiacchierata')
    expect(stages[0]).not.toContain('Chiamata conoscitiva')
    expect(stages[1]).toContain('Colloquio tecnico')
  })

  it('splits requirements into two lists, shows technologies as tags and hides empty sections', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page() } })
    const sections = wrapper.findAll('[data-section]').map((node) => node.attributes('data-section'))
    expect(sections).toEqual(['summary', 'responsibilities', 'mustHave', 'niceToHave', 'technologies', 'benefits', 'growth', 'culture'])
    expect(wrapper.find('[data-section="mustHave"]').text()).toContain('TypeScript')
    expect(wrapper.find('[data-section="niceToHave"]').text()).toContain('Postgres')
    expect(wrapper.find('[data-section="technologies"] li').text()).toBe('Node.js')
    expect(wrapper.find('[data-section="workLifeBalance"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ad-gap"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ad-hint"]').exists()).toBe(false)
  })

  it('uses one h1 for the title and h2 for the sections', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page() } })
    expect(wrapper.findAll('h1').map((node) => node.text())).toEqual(['Backend developer'])
    expect(wrapper.findAll('h2').map((node) => node.text())).toContain('Processo di selezione')
  })

  it('links back to every open position', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page() } })
    expect(wrapper.find('[data-testid="back-to-jobs"]').attributes('href')).toBe('/careers/acme')
    expect(wrapper.find('[data-testid="back-to-jobs"]').text()).toBe('Tutte le posizioni aperte')
  })

  it('reads in the language of the ad, not of the visitor', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page({ language: 'en' }) } })
    expect(wrapper.find('[data-testid="job-ad"]').attributes('lang')).toBe('en')
    expect(wrapper.text()).toContain('Selection process')
    expect(wrapper.text()).toContain('What you will do')
    expect(wrapper.find('[data-fact="process"]').text()).toContain('2 stages')
    expect(wrapper.find('[data-fact="salary"]').text()).toContain('€45,000 - 60,000')
    expect(wrapper.find('[data-testid="promise-sticker"]').attributes('aria-label')).toBe('We always reply, after every stage')
    expect(wrapper.text()).not.toContain('Processo di selezione')
  })

  it('says applications are not open while the organization has no privacy notice', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page() } })
    expect(wrapper.find('[data-testid="apply-not-open"]').text()).toBe('Le candidature per questo annuncio non sono ancora aperte.')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('[data-testid="apply-cta"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="apply-section"]').exists()).toBe(false)
  })

  it('offers the apply action near the facts and the section at the end, in the language of the ad', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page({ language: 'en' }, null, publicNotice()) } })
    expect(wrapper.find('[data-testid="apply-cta"]').text()).toContain('Apply')
    expect(wrapper.find('[data-testid="apply-section"] h2').text()).toBe('Apply for this position')
    await wrapper.find('[data-testid="apply-cta"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="application-form"]').exists()).toBe(true))
  })
})

describe('CareersList', () => {
  const summary = {
    slug: 'backend-1',
    title: 'Backend developer',
    role: 'backend_developer' as const,
    seniority: 'senior' as const,
    contractType: 'permanent' as const,
    workMode: 'remote' as const,
    location: { country: 'IT' },
    salary: { min: 40000, max: 50000, currency: 'EUR' as const, period: 'year' as const },
    stageCount: 2,
    responseDays: 5,
    publishedAt: '2026-10-13T10:00:00.000Z',
    updatedAt: '2026-10-13T10:00:00.000Z',
  }

  it('lists the ads with a stable path link and the salary always visible', async () => {
    const wrapper = await mountSuspended(CareersList, { props: { careers: { organization: { name: 'Acme', slug: 'acme', logo: 'https://cdn.test/l.png' }, jobs: [summary] } } })
    expect(wrapper.find('h2').text()).toBe('Posizioni aperte')
    const card = wrapper.find('[data-testid="careers-job"]')
    expect(card.find('a').attributes('href')).toBe('/careers/acme/backend-1')
    expect(card.text()).toContain('Senior')
    expect(card.text()).toContain('Tempo indeterminato')
    expect(card.text()).toContain('Da remoto · Italia')
    expect(card.find('[data-testid="careers-salary"]').text()).toContain('40.000')
  })

  it('shows an empty state', async () => {
    const wrapper = await mountSuspended(CareersList, { props: { careers: { organization: { name: 'Acme', slug: 'acme', logo: null }, jobs: [] } } })
    expect(wrapper.find('[data-testid="careers-empty"]').text()).toContain('Al momento non ci sono posizioni aperte')
    expect(wrapper.find('[data-testid="careers-job"]').exists()).toBe(false)
  })
})

const stubNavigator = (sendBeacon: () => boolean, doNotTrack: string): void => {
  Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true })
  Object.defineProperty(navigator, 'doNotTrack', { value: doNotTrack, configurable: true })
}
const restoreNavigator = (): void => {
  Reflect.deleteProperty(navigator, 'sendBeacon')
  Reflect.deleteProperty(navigator, 'doNotTrack')
}

describe('PublicJobBody visit beacon', () => {
  beforeAll(async () => {
    await useNuxtApp().$i18n.loadLocaleMessages('en')
  })

  it('counts the visit once the page is shown, with only the source and campaign of the URL', async () => {
    const sendBeacon = vi.fn(() => true)
    stubNavigator(sendBeacon, '0')
    window.history.replaceState({}, '', '/careers/acme/backend-1?utm_source=LinkedIn&utm_campaign=autumn')
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page() } })
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(sendBeacon).toHaveBeenCalledWith('/api/v1/public/organizations/acme/jobs/backend-1/view?source=linkedin&campaign=autumn')
    wrapper.unmount()
    window.history.replaceState({}, '', '/')
    restoreNavigator()
  })

  it('does not count a visitor who sends Do Not Track', async () => {
    const sendBeacon = vi.fn(() => true)
    stubNavigator(sendBeacon, '1')
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page() } })
    expect(sendBeacon).not.toHaveBeenCalled()
    wrapper.unmount()
    restoreNavigator()
  })
})
