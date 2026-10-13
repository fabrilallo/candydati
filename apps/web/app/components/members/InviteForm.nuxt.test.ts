import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/auth-errors'
import InviteForm from './InviteForm.vue'

const api = vi.hoisted(() => ({ inviteMember: vi.fn() }))
mockNuxtImport('useAuthApi', () => () => api)

const optionValues = (wrapper: VueWrapper): string[] =>
  wrapper.findAll('#invite-role option').map((option) => option.attributes('value') ?? '')

const fill = async (wrapper: VueWrapper, email: string): Promise<void> => {
  await wrapper.find('#invite-email').setValue(email)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('InviteForm', () => {
  beforeEach(() => {
    api.inviteMember.mockReset()
    api.inviteMember.mockResolvedValue(undefined)
  })

  it('offers every role to an owner and proposes the default one', async () => {
    const wrapper = await mountSuspended(InviteForm, { props: { actorRole: 'owner' } })
    expect(optionValues(wrapper)).toEqual(['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer'])
    expect((wrapper.find('#invite-role').element as HTMLSelectElement).value).toBe('recruiter')
    // The server-rendered markup must carry the choice too: `:value` alone is lost on hydration.
    expect(wrapper.find('#invite-role option[selected]').attributes('value')).toBe('recruiter')
  })

  it('keeps the owner role out of reach of an admin', async () => {
    const wrapper = await mountSuspended(InviteForm, { props: { actorRole: 'admin' } })
    expect(optionValues(wrapper)).not.toContain('owner')
    expect(optionValues(wrapper)).toContain('admin')
  })

  it('hides the form without the permission to manage members', async () => {
    const wrapper = await mountSuspended(InviteForm, { props: { actorRole: 'recruiter' } })
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Il tuo ruolo non permette di invitare persone')
  })

  it('validates before calling the api', async () => {
    const wrapper = await mountSuspended(InviteForm, { props: { actorRole: 'owner' } })
    await fill(wrapper, 'not-an-email')
    expect(api.inviteMember).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').text()).toBe('Inserisci un indirizzo email valido')
  })

  it('invites with the chosen role, clears the email and notifies the parent', async () => {
    const wrapper = await mountSuspended(InviteForm, { props: { actorRole: 'owner' } })
    await wrapper.find('#invite-role').setValue('hiring_manager')
    await fill(wrapper, ' new@example.com ')
    expect(api.inviteMember).toHaveBeenCalledWith({ email: 'new@example.com', role: 'hiring_manager' })
    expect(wrapper.emitted('invited')?.[0]).toEqual(['new@example.com'])
    expect((wrapper.find('#invite-email').element as HTMLInputElement).value).toBe('')
  })

  it('shows the api failure inline instead of swallowing it', async () => {
    api.inviteMember.mockRejectedValue(new AppError('errors.alreadyInvited'))
    const wrapper = await mountSuspended(InviteForm, { props: { actorRole: 'owner' } })
    await fill(wrapper, 'new@example.com')
    expect(wrapper.find('[role="alert"]').text()).toBe('Questa persona ha già un invito in sospeso')
    expect(wrapper.emitted('invited')).toBeUndefined()
  })
})
