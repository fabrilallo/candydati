import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/auth-errors'
import OnboardingForm from './OnboardingForm.vue'

const api = vi.hoisted(() => ({ createOrganization: vi.fn() }))
mockNuxtImport('useAuthApi', () => () => api)

const input = (wrapper: Awaited<ReturnType<typeof mountSuspended>>, id: string): HTMLInputElement => wrapper.find(`#${id}`).element as HTMLInputElement

describe('OnboardingForm', () => {
  beforeEach(() => {
    api.createOrganization.mockReset()
    api.createOrganization.mockResolvedValue({ id: 'o1', name: 'Società Rossi', slug: 'societa-rossi' })
  })

  it('derives the slug from the name while typing', async () => {
    const wrapper = await mountSuspended(OnboardingForm)
    await wrapper.find('#org-name').setValue('Società Rossi & Figli')
    expect(input(wrapper, 'org-slug').value).toBe('societa-rossi-figli')
  })

  it('stops deriving once the slug has been edited by hand', async () => {
    const wrapper = await mountSuspended(OnboardingForm)
    await wrapper.find('#org-name').setValue('Acme')
    await wrapper.find('#org-slug').setValue('acme-hr')
    await wrapper.find('#org-name').setValue('Acme Recruiting')
    expect(input(wrapper, 'org-slug').value).toBe('acme-hr')
  })

  it('validates name and slug without calling the api', async () => {
    const wrapper = await mountSuspended(OnboardingForm)
    await wrapper.find('#org-name').setValue('A')
    await wrapper.find('#org-slug').setValue('Not Valid')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.createOrganization).not.toHaveBeenCalled()
    expect(wrapper.findAll('[role="alert"]').map((node) => node.text())).toEqual(['Almeno 2 caratteri', 'Solo lettere minuscole, numeri e trattini singoli'])
  })

  it('creates the organization and notifies the page', async () => {
    const wrapper = await mountSuspended(OnboardingForm)
    await wrapper.find('#org-name').setValue('Società Rossi')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.createOrganization).toHaveBeenCalledWith({ name: 'Società Rossi', slug: 'societa-rossi' })
    expect(wrapper.emitted('created')?.[0]).toEqual([{ id: 'o1', name: 'Società Rossi', slug: 'societa-rossi' }])
  })

  it('shows a taken slug as a readable message', async () => {
    api.createOrganization.mockRejectedValue(new AppError('errors.slugTaken'))
    const wrapper = await mountSuspended(OnboardingForm)
    await wrapper.find('#org-name').setValue('Acme')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('Questo indirizzo breve è già in uso')
    expect(wrapper.emitted('created')).toBeUndefined()
  })
})
