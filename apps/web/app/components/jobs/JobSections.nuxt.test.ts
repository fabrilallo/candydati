import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { emptyForm, type JobForm } from '@/lib/job-form'
import JobBasicsSection from './JobBasicsSection.vue'
import JobProcessSection from './JobProcessSection.vue'
import JobSalarySection from './JobSalarySection.vue'
import JobWorkSection from './JobWorkSection.vue'

const form = (overrides: Partial<JobForm> = {}): JobForm => ({ ...emptyForm(), ...overrides })
const props = (overrides: Partial<JobForm> = {}, errors: Record<string, string> = {}) => ({ form: form(overrides), disabled: false, errors })

describe('JobBasicsSection', () => {
  it('groups roles by family and offers every seniority and contract type', async () => {
    const wrapper = await mountSuspended(JobBasicsSection, { props: props() })
    const groups = wrapper.findAll('#job-field-role optgroup').map((node) => node.attributes('label'))
    expect(groups).toHaveLength(12)
    expect(groups[0]).toBe('Ingegneria software')
    expect(wrapper.findAll('#job-field-role option')).toHaveLength(61)
    expect(wrapper.findAll('#job-field-seniority option')).toHaveLength(10)
    expect(wrapper.findAll('#job-field-contractType option')).toHaveLength(7)
  })

  it('patches immutably and ties the error to the field', async () => {
    const wrapper = await mountSuspended(JobBasicsSection, { props: props({}, { title: 'validation.required' }) })
    expect(wrapper.find('#job-field-title').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('#job-field-title').attributes('aria-describedby')).toBe('job-field-title-error')
    await wrapper.find('#job-field-role').setValue('recruiter')
    expect(wrapper.emitted('patch')?.[0]).toEqual([{ role: 'recruiter', customRole: '' }])
  })
})

describe('JobBasicsSection custom role', () => {
  it('offers an option to write a role, last and outside the families', async () => {
    const wrapper = await mountSuspended(JobBasicsSection, { props: props() })
    const options = wrapper.findAll('#job-field-role option')
    expect(options.at(-1)?.attributes('value')).toBe('other')
    expect(options.at(-1)?.text()).toBe('Altro (scrivi il ruolo)')
    expect(wrapper.find('#job-field-customRole').exists()).toBe(false)
  })

  it('reveals a labelled text input for the other role and patches what is typed', async () => {
    const wrapper = await mountSuspended(JobBasicsSection, { props: props({ role: 'other', customRole: 'Pasticcere' }) })
    const input = wrapper.find('#job-field-customRole')
    expect(wrapper.find('label[for="job-field-customRole"]').text()).toBe('Il ruolo')
    expect(input.attributes('maxlength')).toBe('80')
    await input.setValue('Pastry chef')
    expect(wrapper.emitted('patch')?.[0]).toEqual([{ customRole: 'Pastry chef' }])
  })

  it('ties the missing text to the field, the way the publish rules report it', async () => {
    const wrapper = await mountSuspended(JobBasicsSection, { props: props({ role: 'other' }, { customRole: 'job.rules.required' }) })
    expect(wrapper.find('#job-field-customRole').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('#job-field-customRole').attributes('aria-describedby')).toContain('job-field-customRole-error')
  })

  it('drops the text when going back to a role of the list', async () => {
    const wrapper = await mountSuspended(JobBasicsSection, { props: props({ role: 'other', customRole: 'Pasticcere' }) })
    await wrapper.find('#job-field-role').setValue('recruiter')
    expect(wrapper.emitted('patch')?.[0]).toEqual([{ role: 'recruiter', customRole: '' }])
  })
})

describe('JobSalarySection', () => {
  it('labels amounts as gross and offers the RAL period', async () => {
    const wrapper = await mountSuspended(JobSalarySection, { props: props() })
    expect(wrapper.text()).toContain('Importi lordi')
    expect(wrapper.text()).toContain('RAL')
    expect(wrapper.find('label[for="job-field-salary-min"]').text()).toBe('Minimo (lordo)')
    await wrapper.find('#job-field-salary-max').setValue('60000')
    expect(wrapper.emitted('patch')?.[0]).toEqual([{ salaryMax: '60000' }])
  })

  it('writes amounts with thousands separators and the currency of the ad, storing digits only', async () => {
    const wrapper = await mountSuspended(JobSalarySection, { props: props({ salaryMin: '45000', language: 'en', currency: 'GBP' }) })
    expect((wrapper.find('#job-field-salary-min').element as HTMLInputElement).value).toBe('45,000')
    expect(wrapper.text()).toContain('£')
    await wrapper.find('#job-field-salary-min').setValue('48.500 €')
    expect(wrapper.emitted('patch')?.[0]).toEqual([{ salaryMin: '48500' }])
    expect((wrapper.find('#job-field-salary-min').element as HTMLInputElement).value).toBe('48,500')
  })
})

describe('JobWorkSection', () => {
  it.each([
    ['hybrid', true],
    ['onsite', true],
    ['remote', false],
    ['', false],
  ])('for %s the place fields are shown: %s', async (workMode, shown) => {
    const wrapper = await mountSuspended(JobWorkSection, { props: props({ workMode }) })
    expect(wrapper.find('#job-field-location-city').exists()).toBe(shown)
    expect(wrapper.find('#job-field-location-onsiteDaysPerWeek').exists()).toBe(shown)
  })

  it('picks the work mode from a radio group with arrow keys', async () => {
    const wrapper = await mountSuspended(JobWorkSection, { props: props({ workMode: 'remote' }) })
    const radios = wrapper.findAll('#job-field-workMode [role="radio"]')
    expect(radios.map((radio) => radio.attributes('aria-checked'))).toEqual(['true', 'false', 'false'])
    expect(radios.map((radio) => radio.attributes('tabindex'))).toEqual(['0', '-1', '-1'])
    await radios[0]?.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('patch')?.[0]).toEqual([{ workMode: 'hybrid' }])
    await radios[0]?.trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('patch')?.[1]).toEqual([{ workMode: 'onsite' }])
    await radios[0]?.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('patch')?.[2]).toEqual([{ workMode: 'onsite' }])
  })

  it('offers a country select with ISO codes, sorted by Italian name', async () => {
    const wrapper = await mountSuspended(JobWorkSection, { props: props({ country: 'IT' }) })
    const options = wrapper.findAll('#job-field-location-country option')
    expect(options.find((o) => o.attributes('value') === 'IT')?.text()).toBe('Italia')
    expect(options.slice(1).every((o) => /^[A-Z]{2}$/.test(o.attributes('value') ?? ''))).toBe(true)
    expect((wrapper.find('#job-field-location-country').element as HTMLSelectElement).value).toBe('IT')
  })
})

describe('JobProcessSection', () => {
  const stage = (type: string, extra: { id?: string; title?: string } = {}) => ({ id: '', title: '', type, durationMinutes: '30', conductedBy: 'recruiter', note: '', ...extra })

  it('adds, removes and reorders stages without mutating the form', async () => {
    const stages = Object.freeze([stage('screening_call'), stage('offer')])
    const wrapper = await mountSuspended(JobProcessSection, { props: props({ process: stages }) })
    expect(wrapper.findAll('[data-testid="stage-row"]')).toHaveLength(2)

    await wrapper.findAll('button').find((b) => b.text() === 'Aggiungi fase')?.trigger('click')
    expect((wrapper.emitted('patch')?.[0]?.[0] as { process: unknown[] }).process).toHaveLength(3)

    await wrapper.find('button[aria-label="Sposta giù la fase 1"]').trigger('click')
    const reordered = (wrapper.emitted('patch')?.[1]?.[0] as { process: { type: string }[] }).process
    expect(reordered.map((s) => s.type)).toEqual(['offer', 'screening_call'])

    await wrapper.find('button[aria-label="Rimuovi la fase 2"]').trigger('click')
    expect((wrapper.emitted('patch')?.[2]?.[0] as { process: { type: string }[] }).process.map((s) => s.type)).toEqual(['screening_call'])
    expect(stages.map((s) => s.type)).toEqual(['screening_call', 'offer'])
  })

  it('has an optional title field per stage, with the translated type as placeholder, and keeps the id', async () => {
    const wrapper = await mountSuspended(JobProcessSection, { props: props({ process: [stage('screening_call', { id: 'stg-a' })] }) })
    const input = wrapper.find('#job-field-process-0-title')
    expect(input.attributes('placeholder')).toBe('Chiamata conoscitiva')
    expect(wrapper.text()).toContain('Facoltativo. Se vuoto mostriamo il tipo.')
    await input.setValue('Chiacchierata')
    expect(wrapper.emitted('patch')?.[0]).toEqual([{ process: [{ ...stage('screening_call'), id: 'stg-a', title: 'Chiacchierata' }] }])
  })

  it('disables removal and explains why when the stage has open candidates', async () => {
    const wrapper = await mountSuspended(JobProcessSection, {
      props: { ...props({ process: [stage('screening_call', { id: 'stg-a' }), stage('offer', { id: 'stg-b' })] }), openCounts: { 'stg-a': 2 } },
    })
    expect(wrapper.find('button[aria-label="Rimuovi la fase 1"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button[aria-label="Rimuovi la fase 2"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="stage-remove-blocked"]').text()).toBe("Sposta prima i 2 candidati in un'altra fase")
    expect(wrapper.find('[data-testid="stage-open-count"]').text()).toBe('2 candidati in questa fase')
    expect(wrapper.findAll('[data-testid="stage-remove-blocked"]')).toHaveLength(1)
  })

  it('blocks the row the server refused, even without a known count', async () => {
    const wrapper = await mountSuspended(JobProcessSection, {
      props: { ...props({ process: [stage('screening_call', { id: 'stg-a' })] }), blockedStages: new Set(['stg-a']) },
    })
    expect(wrapper.find('button[aria-label="Rimuovi la fase 1"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="stage-remove-blocked"]').text()).toContain('non si può rimuovere')
  })

  it('offers stage durations as presets read like the candidate will read them', async () => {
    const wrapper = await mountSuspended(JobProcessSection, { props: props({ process: [stage('screening_call')] }) })
    const labels = wrapper.findAll('#job-field-process-0-duration option').map((option) => option.text())
    expect(labels).toContain('30 min')
    expect(labels).toContain('1 h 30 min')
    expect(labels).toContain('2 g')
  })

  it('edits a stage field and the response time', async () => {
    const wrapper = await mountSuspended(JobProcessSection, { props: props({ process: [stage('screening_call')] }) })
    await wrapper.find('#job-field-process-0-duration').setValue('45')
    expect(wrapper.emitted('patch')?.[0]).toEqual([{ process: [{ ...stage('screening_call'), durationMinutes: '45' }] }])
    await wrapper.find('#job-field-responseDays').setValue('5')
    expect(wrapper.emitted('patch')?.[1]).toEqual([{ responseDays: '5' }])
  })

  it('shows an empty hint and the incomplete-stage error', async () => {
    const wrapper = await mountSuspended(JobProcessSection, { props: props({}, { process: 'job.validation.stageIncomplete' }) })
    expect(wrapper.text()).toContain('Nessuna fase ancora')
    expect(wrapper.find('#job-field-process-error').text()).toContain('tipo, durata')
  })

  it('is read-only when disabled', async () => {
    const wrapper = await mountSuspended(JobProcessSection, { props: { form: form({ process: [stage('offer')] }), disabled: true, errors: {} } })
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.find('#job-field-process-0-duration').attributes('disabled')).toBeDefined()
  })
})
