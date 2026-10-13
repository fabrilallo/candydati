import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import { publicConsent } from '~~/test/fixtures/phase8-fixtures'
import { publicConsentSchema } from '@/lib/phase8-contract'
import { card } from '~~/test/fixtures/candidate-fixtures'
import CandidateCard from '../pipeline/CandidateCard.vue'
import ConsentReconfirm from './ConsentReconfirm.vue'
import ConsentRenewNotice from './ConsentRenewNotice.vue'
import ConsentRenewPill from './ConsentRenewPill.vue'

const state = vi.hoisted(() => ({ bodies: [] as unknown[], status: 200 }))
registerEndpoint('/api/v1/public/consent/tok', {
  method: 'POST',
  handler: async (event) => {
    state.bodies.push(await readBody(event))
    if (state.status !== 200) {
      setResponseStatus(event, state.status)
      return { success: false, data: null, error: { code: 'gone', message: 'gone' } }
    }
    return ok({ status: 'given' })
  },
})

const mounted: { unmount: () => void }[] = []
const mountForm = async () => {
  const { t } = useNuxtApp().$i18n
  const x = (key: string, params: Record<string, unknown> = {}) => t(key, params)
  const wrapper = await mountSuspended(ConsentReconfirm, { props: { token: 'tok', consent: publicConsentSchema.parse(publicConsent()), x }, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  state.bodies = []
  state.status = 200
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('public reconfirmation', () => {
  it('shows the notice as escaped text and asks for the selection consent before confirming', async () => {
    const wrapper = await mountForm()
    expect(wrapper.find('[data-testid="privacy-notice"]').html()).toContain('&lt;b&gt;Diritti&lt;/b&gt;')
    await wrapper.find('[data-testid="reconfirm-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="field-error"]').exists()).toBe(true)
    expect(state.bodies).toEqual([])
  })

  it('confirms with the chosen scopes and thanks the person', async () => {
    const wrapper = await mountForm()
    await wrapper.find('[data-testid="consent-selection"]').setValue(true)
    await wrapper.find('[data-testid="consent-pool"]').setValue(true)
    await wrapper.find('[data-testid="reconfirm-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="reconfirm-outcome"]').attributes('data-outcome')).toBe('given'))
    expect(state.bodies).toEqual([{ scopes: ['selection', 'talent_pool'] }])
    expect(wrapper.text()).toContain('privacy@acme.test')
  })

  it('says plainly that declining erases, asks once more, then erases', async () => {
    const wrapper = await mountForm()
    expect(wrapper.find('[data-testid="reconfirm-decline-hint"]').text()).toContain('cancelliamo subito tutti i tuoi dati')
    await wrapper.find('[data-testid="reconfirm-decline-start"]').trigger('click')
    await wrapper.find('[data-testid="reconfirm-decline-yes"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="reconfirm-outcome"]').attributes('data-outcome')).toBe('erased'))
    expect(state.bodies).toEqual([{ decline: true }])
  })

  it('hands an expired token to the page', async () => {
    state.status = 410
    const wrapper = await mountForm()
    await wrapper.find('[data-testid="consent-selection"]').setValue(true)
    await wrapper.find('[data-testid="reconfirm-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('failed')).toEqual([['expired']]))
  })

  it('shows a rate limit as a message, keeping the form', async () => {
    state.status = 429
    const wrapper = await mountForm()
    await wrapper.find('[data-testid="consent-selection"]').setValue(true)
    await wrapper.find('[data-testid="reconfirm-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="reconfirm-error"]').text()).toContain('qualche minuto'))
  })
})

describe('consent to renew in the app', () => {
  const now = new Date('2026-10-13T10:00:00.000Z')

  it('shows the pill with the days left, and nothing once consent is given', async () => {
    const pill = await mountSuspended(ConsentRenewPill, { props: { status: 'to_renew', expiresAt: '2026-10-25T10:00:00.000Z', now } })
    expect(pill.text()).toContain('Consenso da rinnovare, mancano 12 giorni')
    const none = await mountSuspended(ConsentRenewPill, { props: { status: 'given', expiresAt: null, now } })
    expect(none.find('[data-testid="consent-renew-pill"]').exists()).toBe(false)
  })

  it('shows the days left on a pipeline card to renew', async () => {
    const stages = [{ id: 'received', declared: null }]
    const base = { stages, now, canMove: false, canDecide: false }
    const renew = await mountSuspended(CandidateCard, { props: { ...base, card: card('a1', 'received', { consentStatus: 'to_renew', retentionExpiresAt: '2026-10-25T10:00:00.000Z' }) } })
    expect(renew.find('[data-testid="consent-renew-pill"]').text()).toContain('mancano 12 giorni')
    const given = await mountSuspended(CandidateCard, { props: { ...base, card: card('a2') } })
    expect(given.find('[data-testid="consent-renew-pill"]').exists()).toBe(false)
  })

  it('explains the rule in the privacy tab, with or without an email', async () => {
    const notice = await mountSuspended(ConsentRenewNotice, { props: { expiresAt: '2026-10-25T10:00:00.000Z', hasEmail: false, now } })
    expect(notice.text()).toContain('non ha ricevuto la richiesta')
    expect(notice.find('[data-testid="consent-renew-deadline"]').text()).toContain('mancano 12 giorni')
  })
})
