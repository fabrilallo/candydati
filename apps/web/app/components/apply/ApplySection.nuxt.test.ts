import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { DOMWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { CV_MAX_BYTES } from '@tt/domain'
import { setResponseStatus } from 'h3'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeContent, ok } from '~~/test/fixtures/job-fixtures'
import { publicNotice } from '~~/test/fixtures/candidate-fixtures'
import ApplySection from './ApplySection.vue'

const state = vi.hoisted(() => ({ reply: 'ok' as 'ok' | 'already' | 'outdated' | 'tooMany', posts: 0 }))
const BASE = '/api/v1/public/organizations/acme/jobs/backend-1'
registerEndpoint(`${BASE}/applications`, {
  method: 'POST',
  handler: async (event) => {
    state.posts += 1
    if (state.reply === 'already') return (setResponseStatus(event, 409), { success: false, data: null, error: { code: 'conflict', message: 'already_applied' } })
    if (state.reply === 'outdated') return (setResponseStatus(event, 409), { success: false, data: null, error: { code: 'conflict', message: 'privacy_notice_outdated' } })
    if (state.reply === 'tooMany') return (setResponseStatus(event, 429), { success: false, data: null, error: { code: 'rate_limited', message: 'x' } })
    return (setResponseStatus(event, 201), ok({ received: true }))
  },
})
registerEndpoint(BASE, () =>
  ok({
    organization: { name: 'Acme', slug: 'acme', logo: null },
    job: { slug: 'backend-1', content: completeContent, publishedAt: '2026-10-13T10:00:00.000Z', updatedAt: '2026-10-13T10:00:00.000Z' },
    privacyNotice: publicNotice({ version: 4 }),
  }),
)

const mounted: { unmount: () => void }[] = []
const mountSection = async (language = 'it') => {
  const wrapper = await mountSuspended(ApplySection, {
    props: { org: 'acme', job: 'backend-1', title: 'Backend developer', organization: 'Acme', language, responseDays: 5, notice: publicNotice() },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await wrapper.find('[data-testid="apply-open"]').trigger('click')
  await flushPromises()
  return wrapper
}
const fill = async (input: DOMWrapper<Element> | undefined, value: string) => input?.setValue(value)
const chooseFile = async (wrapper: Awaited<ReturnType<typeof mountSection>>, file: File) => {
  const input = wrapper.find('[data-testid="cv-input"]').element as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await wrapper.find('[data-testid="cv-input"]').trigger('change')
}
const pdf = (size = 2048) => new File([new Uint8Array(size)], 'cv-giulia.pdf', { type: 'application/pdf' })
const fillValid = async (wrapper: Awaited<ReturnType<typeof mountSection>>) => {
  await fill(wrapper.find('#apply-first-name'), 'Giulia')
  await fill(wrapper.find('#apply-last-name'), 'Rossi')
  await fill(wrapper.find('#apply-email'), 'giulia@example.com')
  await chooseFile(wrapper, pdf())
  await wrapper.find('[data-testid="consent-selection"]').setValue(true)
}

beforeAll(async () => {
  await useNuxtApp().$i18n.loadLocaleMessages('en')
})
beforeEach(() => {
  state.reply = 'ok'
  state.posts = 0
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('ApplySection', () => {
  it('opens a calm form with the notice, its version and contact, and two separate consents', async () => {
    const wrapper = await mountSection()
    expect(document.activeElement?.id).toBe('apply-first-name')
    expect(wrapper.find('[data-testid="privacy-notice"] summary').text()).toContain('Versione 3')
    expect(wrapper.findAll('[data-testid="privacy-text"] p')).toHaveLength(2)
    expect(wrapper.find('[data-testid="privacy-contact"]').attributes('href')).toBe('mailto:privacy@acme.test')
    expect(wrapper.find('#consent-selection-hint').text()).toBe('I dati restano per 1 anno dalla candidatura, poi vengono cancellati.')
    expect(wrapper.find('#consent-pool-hint').text()).toContain('i dati restano per 2 anni')
    expect(wrapper.find('[data-testid="consent-pool"]').attributes('required')).toBeUndefined()
  })

  it('hides the honeypot from people and assistive technology', async () => {
    const wrapper = await mountSection()
    const trap = wrapper.find('[data-testid="honeypot"]')
    expect(trap.attributes('aria-hidden')).toBe('true')
    expect(trap.find('input').attributes('tabindex')).toBe('-1')
    expect(trap.find('input').attributes('autocomplete')).toBe('off')
  })

  it('points at what is missing, focusing the first field, without sending anything', async () => {
    const wrapper = await mountSection()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const errors = wrapper.findAll('[data-testid="field-error"]').map((node) => node.text())
    expect(errors).toEqual(['Campo obbligatorio', 'Campo obbligatorio', 'Inserisci un indirizzo email valido', 'Allega il tuo CV', 'Serve il consenso per questa selezione: senza non possiamo valutare la candidatura.'])
    expect(document.activeElement?.id).toBe('apply-first-name')
    expect(state.posts).toBe(0)
  })

  it('checks the CV before uploading and lets the candidate remove it', async () => {
    const wrapper = await mountSection()
    await chooseFile(wrapper, new File(['x'], 'cv.doc'))
    expect(wrapper.find('[data-testid="field-error"]').text()).toBe('Usa un file PDF o DOCX')
    await chooseFile(wrapper, pdf(CV_MAX_BYTES + 1))
    expect(wrapper.find('[data-testid="field-error"]').text()).toBe('Il file supera i 10 MB')
    await chooseFile(wrapper, pdf(1_572_864))
    expect(wrapper.find('[data-testid="cv-file"]').text()).toContain('cv-giulia.pdf')
    expect(wrapper.find('[data-testid="cv-file"]').text()).toContain('1,5 MB')
    await wrapper.find('[data-testid="cv-remove"]').trigger('click')
    expect(wrapper.find('[data-testid="cv-dropzone"]').exists()).toBe(true)
  })

  it('accepts a dropped file', async () => {
    const wrapper = await mountSection()
    await wrapper.find('[data-testid="cv-dropzone"]').trigger('drop', { dataTransfer: { files: [pdf()] } })
    expect(wrapper.find('[data-testid="cv-file"]').exists()).toBe(true)
  })

  // The multipart body itself is covered in lib/application-form.test.ts: the in-process test fetch drops FormData.
  it('sends the application once, then restates the response commitment of the ad', async () => {
    const wrapper = await mountSection()
    await fillValid(wrapper)
    await wrapper.find('[data-testid="consent-pool"]').setValue(true)
    await fill(wrapper.find('#apply-linkedin'), 'linkedin.com/in/giulia')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="apply-success"]').exists()).toBe(true))
    expect(state.posts).toBe(1)
    expect(wrapper.find('[data-testid="apply-commitment"]').text()).toBe('Riceverai una risposta entro 5 giorni dopo ogni fase.')
    expect(wrapper.find('[data-testid="apply-success"]').text()).toContain('Ti scriveremo a giulia@example.com.')
    expect(document.activeElement?.id).toBe('apply-success-title')
  })

  it('says so when the candidate already applied, and when they send too often', async () => {
    state.reply = 'already'
    const wrapper = await mountSection()
    await fillValid(wrapper)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="apply-error"]').text()).toContain('Hai già una candidatura aperta'))
    state.reply = 'tooMany'
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="apply-error"]').text()).toContain('Troppi invii'))
  })

  it('reloads a notice that changed meanwhile and asks for consent again', async () => {
    state.reply = 'outdated'
    const wrapper = await mountSection()
    await fillValid(wrapper)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="notice-changed"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="notice-changed"]').text()).toContain('versione 4')
    expect(wrapper.find('[data-testid="privacy-notice"] summary').text()).toContain('Versione 4')
    expect((wrapper.find('[data-testid="consent-selection"]').element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.find('[data-testid="apply-error"]').text()).toContain("L'informativa è cambiata")
  })

  it('reads in the language of the ad', async () => {
    const wrapper = await mountSection('en')
    expect(wrapper.find('h2').text()).toBe('Apply for this position')
    expect(wrapper.find('label[for="apply-first-name"]').text()).toBe('First name')
    expect(wrapper.find('#consent-selection-hint').text()).toBe('The data is kept for 1 year from the application, then deleted.')
  })
})
