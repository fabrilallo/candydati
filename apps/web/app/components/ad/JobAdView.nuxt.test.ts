import { mountSuspended } from '@nuxt/test-utils/runtime'
import { checkPublishable, type JobContent } from '@tt/domain'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { completeContent, incompleteContent } from '~~/test/fixtures/job-fixtures'
import JobAdView from './JobAdView.vue'

const organization = { name: 'Acme', logo: null }
const preview = (content: JobContent, extra: Record<string, unknown> = {}) =>
  mountSuspended(JobAdView, { props: { content, organization, mode: 'preview' as const, issues: checkPublishable(content), ...extra } })

afterEach(() => {
  document.body.innerHTML = ''
})

describe('JobAdView in preview', () => {
  it('uses an h2 title so the editor keeps a single h1', async () => {
    const wrapper = await preview(completeContent)
    expect(wrapper.find('h1').exists()).toBe(false)
    expect(wrapper.find('h2').text()).toBe('Backend developer')
  })

  it('shows each missing element where it will appear, and a button that asks to jump to the field', async () => {
    const content = { ...incompleteContent, title: '' }
    const wrapper = await preview(content, { issues: [{ path: 'title', rule: 'required' }, ...checkPublishable(content)] })
    expect(wrapper.find('[data-gap="title"]').text()).toBe("Manca il titolo dell'annuncio")
    await wrapper.find('[data-fact="salary"] [data-testid="ad-gap"]').trigger('click')
    await wrapper.find('[data-gap="mustHave"]').trigger('click')
    expect(wrapper.emitted('jump')).toEqual([['job-field-salary-min'], ['job-field-requirements-mustHave']])
  })

  it('names the rule when a value is there but wrong', async () => {
    const content = { ...completeContent, salary: { ...completeContent.salary, min: 70000, max: 60000 } }
    const wrapper = await preview(content)
    expect(wrapper.find('[data-gap="salary"]').text()).toBe('Il massimo non può essere inferiore al minimo')
  })

  it('shows empty optional sections as quiet hints that also jump to their field', async () => {
    const wrapper = await preview({ ...completeContent, benefits: [], workLifeBalance: '' })
    const hints = wrapper.findAll('[data-testid="ad-hint"]').map((hint) => hint.attributes('data-hint'))
    expect(hints).toEqual(['benefits', 'workLifeBalance'])
    await wrapper.find('[data-hint="benefits"]').trigger('click')
    expect(wrapper.emitted('jump')).toEqual([['job-field-benefits']])
  })

  it('underlines vague phrases and opens their rewrite', async () => {
    const phrases = [{ text: 'piattaforma', category: 'responsibilities_clarity' as const, suggestion: 'Di quale piattaforma si tratta?' }]
    const wrapper = await preview(completeContent, { phrases })
    const mark = wrapper.find('[data-testid="vague-mark"]')
    expect(mark.text()).toContain('piattaforma')
    await mark.trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[data-testid="vague-popover"]')?.textContent).toContain('Di quale piattaforma si tratta?')
  })

  it('never shows gaps, hints or highlights in public mode', async () => {
    const phrases = [{ text: 'piattaforma', category: 'culture' as const, suggestion: 'x' }]
    const wrapper = await mountSuspended(JobAdView, {
      props: { content: { ...completeContent, benefits: [] }, organization, mode: 'public', issues: [{ path: 'role', rule: 'required' }], phrases },
    })
    expect(wrapper.find('[data-testid="ad-gap"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ad-hint"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="vague-mark"]').exists()).toBe(false)
    expect(wrapper.find('[data-section="benefits"]').exists()).toBe(false)
  })
})

describe('JobAdView with employment terms and compliance', () => {
  const publicView = (content: JobContent) => mountSuspended(JobAdView, { props: { content, organization, mode: 'public' as const } })

  it('shows the CCNL and monthly payments in the facts band, quantified benefits first, and the legal sentence', async () => {
    const wrapper = await publicView({
      ...completeContent,
      employment: { ccnl: 'commercio_terziario', level: '5° livello', monthlyPayments: 14, mealVoucher: { amountPerDay: 8, type: 'electronic' }, extraBenefits: ['health_insurance'] },
      protectedCategories: 'also',
    })
    expect(wrapper.find('[data-fact="ccnl"]').text()).toContain('Commercio e terziario, 5° livello')
    expect(wrapper.find('[data-fact="monthlyPayments"]').text()).toContain('14 mensilità')
    const benefits = wrapper.findAll('[data-testid="employment-benefit"]').map((item) => item.text().replace(/\s/g, ' '))
    expect(benefits).toEqual(['Buoni pasto da 8 € al giorno, elettronici', 'Assicurazione sanitaria'])
    expect(wrapper.find('[data-section="benefits"]').text()).toContain('Buoni pasto')
    expect(wrapper.find('[data-testid="protected-categories"]').text()).toBe('Posizione aperta anche agli iscritti alle liste del collocamento mirato ai sensi della L. 68/99.')
  })

  it('underlines compliance findings in the preview and applies a fix from the popover', async () => {
    const item = { key: 'k', rule: 'gender_exclusive_title', path: 'title', fieldId: 'job-field-title', blocking: true, match: 'developer', suggestion: 'Rivolgiti a tutti.', messageKey: 'job.compliance.rules.gender_exclusive_title', fixes: [{ labelKey: 'job.compliance.fix.addMarker', params: { marker: '(m/f)' }, patch: { title: 'Backend developer (m/f)' } }] }
    const wrapper = await preview(completeContent, { marks: [{ text: 'developer', item }] })
    const mark = wrapper.find('[data-testid="compliance-mark"]')
    expect(mark.attributes('data-blocking')).toBe('true')
    await mark.trigger('click')
    await flushPromises()
    const fix = [...document.body.querySelectorAll('[data-testid="compliance-popover"] button')].find((button) => button.textContent?.includes('(m/f)')) as HTMLElement
    fix.click()
    expect(wrapper.emitted('fix')).toEqual([[item.fixes[0]]])
  })
})
