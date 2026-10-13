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
    expect(wrapper.findAll('#job-field-role option')).toHaveLength(60)
    expect(wrapper.findAll('#job-field-seniority option')).toHaveLength(10)
    expect(wrapper.findAll('#job-field-contractType option')).toHaveLength(7)
  })

  it('patches immutably and ties the error to the field', async () => {
    const wrapper = await mountSuspended(JobBasicsSection, { props: props({}, { title: 'validation.required' }) })
    expect(wrapper.find('#job-field-title').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('#job-field-title').attributes('aria-describedby')).toBe('job-field-title-error')
    await wrapper.find('#job-field-role').setValue('recruiter')
    expect(wrapper.emitted('patch')?.[0]).toEqual([{ role: 'recruiter' }])
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

  it('offers a country select with ISO codes, sorted by Italian name', async () => {
    const wrapper = await mountSuspended(JobWorkSection, { props: props({ country: 'IT' }) })
    const options = wrapper.findAll('#job-field-location-country option')
    expect(options.find((o) => o.attributes('value') === 'IT')?.text()).toBe('Italia')
    expect(options.slice(1).every((o) => /^[A-Z]{2}$/.test(o.attributes('value') ?? ''))).toBe(true)
    expect((wrapper.find('#job-field-location-country').element as HTMLSelectElement).value).toBe('IT')
  })
})

describe('JobProcessSection', () => {
  const stage = (type: string) => ({ type, durationMinutes: '30', conductedBy: 'recruiter', note: '' })

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
