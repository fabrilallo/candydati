import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import StageInterviewers from './StageInterviewers.vue'

const members = [
  { userId: 'u1', name: 'Anna Bianchi', email: 'anna@example.com' },
  { userId: 'u2', name: 'Bruno Neri', email: 'bruno@example.com' },
]
const anna = { kind: 'member' as const, userId: 'u1', email: 'anna@example.com', name: 'Anna Bianchi' }
const mounted: { unmount: () => void }[] = []
const mountIt = async (interviewers = [anna]) => {
  const wrapper = await mountSuspended(StageInterviewers, { props: { id: 'st', interviewers, members }, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('Chi fa il colloquio', () => {
  it('shows who is chosen and removes them', async () => {
    const wrapper = await mountIt()
    expect(wrapper.find('[data-testid="interviewer-chip"]').text()).toContain('Anna Bianchi')
    await wrapper.find('[aria-label="Togli Anna Bianchi"]').trigger('click')
    expect(wrapper.emitted('change')).toEqual([[[]]])
  })

  it('adds a member from the picker, offering only who is not there yet', async () => {
    const wrapper = await mountIt()
    await wrapper.find('[data-testid="st-add"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    const options = [...document.body.querySelectorAll<HTMLElement>('[data-testid="interviewer-member"]')]
    expect(options.map((option) => option.textContent)).toEqual([expect.stringContaining('Bruno Neri')])
    options[0]?.click()
    await flushPromises()
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual([anna, { kind: 'member', userId: 'u2', email: 'bruno@example.com', name: 'Bruno Neri' }])
  })

  it('adds someone outside the team with name and email, refusing a wrong email', async () => {
    const wrapper = await mountIt([])
    expect(wrapper.text()).toContain('Nessuno ancora')
    await wrapper.find('[data-testid="st-add"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    document.body.querySelector<HTMLElement>('[data-testid="interviewer-external"]')?.click()
    await flushPromises()
    await wrapper.find('#st-ext-name').setValue('Luca Verdi')
    await wrapper.find('#st-ext-email').setValue('luca@')
    await wrapper.find('[data-testid="external-add"]').trigger('click')
    expect(wrapper.text()).toContain("Scrivi un'email valida")
    await wrapper.find('#st-ext-email').setValue('Luca@Studio.it')
    await wrapper.find('[data-testid="external-add"]').trigger('click')
    expect(wrapper.emitted('change')).toEqual([[[{ kind: 'external', userId: null, email: 'luca@studio.it', name: 'Luca Verdi' }]]])
    expect(wrapper.find('[data-testid="external-form"]').exists()).toBe(false)
  })
})
