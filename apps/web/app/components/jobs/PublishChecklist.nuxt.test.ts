import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import PublishChecklist from './PublishChecklist.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('PublishChecklist', () => {
  it('lists each issue with a translated field name and message', async () => {
    const wrapper = await mountSuspended(PublishChecklist, {
      props: { issues: [{ path: 'salary.max', rule: 'salary_max_below_min' }, { path: 'responsibilities', rule: 'too_few_responsibilities' }] },
    })
    const rows = wrapper.findAll('[data-testid="checklist-issue"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('RAL massima')
    expect(rows[0]?.text()).toContain('Il massimo non può essere inferiore al minimo')
    expect(rows[1]?.text()).toContain('Servono almeno tre responsabilità')
    expect(wrapper.text()).toContain('Mancano 2 elementi')
    expect(rows[0]?.find('a').attributes('href')).toBe('#job-field-salary-max')
  })

  it('says the ad is ready when nothing is missing', async () => {
    const wrapper = await mountSuspended(PublishChecklist, { props: { issues: [] } })
    expect(wrapper.find('[data-testid="checklist-ready"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="checklist-issue"]').exists()).toBe(false)
  })

  it('moves focus to the field when an issue is clicked', async () => {
    const input = document.createElement('input')
    input.id = 'job-field-role'
    document.body.append(input)
    const wrapper = await mountSuspended(PublishChecklist, { props: { issues: [{ path: 'role', rule: 'required' }] } })
    await wrapper.find('a').trigger('click')
    expect(document.activeElement).toBe(input)
  })

  it('does nothing when the field is not on the page', async () => {
    const wrapper = await mountSuspended(PublishChecklist, { props: { issues: [{ path: 'role', rule: 'required' }] } })
    await expect(wrapper.find('a').trigger('click')).resolves.toBeUndefined()
  })
})
