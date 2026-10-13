import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/auth-errors'
import AuthForm from './AuthForm.vue'

const mocks = vi.hoisted(() => ({
  api: { signIn: vi.fn(), signUp: vi.fn(), getSession: vi.fn(), listOrganizations: vi.fn(), setActiveOrganization: vi.fn(), getFullOrganization: vi.fn() },
  navigateTo: vi.fn(),
}))
mockNuxtImport('useAuthApi', () => () => mocks.api)
mockNuxtImport('navigateTo', () => mocks.navigateTo)

const submit = async (wrapper: Awaited<ReturnType<typeof mountSuspended>>): Promise<void> => {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('AuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.api.signIn.mockResolvedValue(undefined)
    mocks.api.signUp.mockResolvedValue(undefined)
    mocks.api.getSession.mockResolvedValue(null)
  })

  it('signs in with email and password, then goes to the app', async () => {
    const wrapper = await mountSuspended(AuthForm, { props: { mode: 'login' } })
    await wrapper.find('#email').setValue('ada@example.com')
    await wrapper.find('#password').setValue('secret-pass')
    await submit(wrapper)
    expect(mocks.api.signIn).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'secret-pass' })
    expect(mocks.navigateTo).toHaveBeenCalledWith('/app')
  })

  it('shows wrong credentials inline and stays on the page', async () => {
    mocks.api.signIn.mockRejectedValue(new AppError('errors.invalidCredentials'))
    const wrapper = await mountSuspended(AuthForm, { props: { mode: 'login' } })
    await wrapper.find('#email').setValue('ada@example.com')
    await wrapper.find('#password').setValue('nope')
    await submit(wrapper)
    expect(wrapper.find('[role="alert"]').text()).toBe('Email o password non corrette')
    expect(mocks.navigateTo).not.toHaveBeenCalled()
  })

  it('signs up with name, email and a long enough password', async () => {
    const wrapper = await mountSuspended(AuthForm, { props: { mode: 'signup' } })
    await wrapper.find('#name').setValue('Ada Lovelace')
    await wrapper.find('#email').setValue('ada@example.com')
    await wrapper.find('#password').setValue('short')
    await submit(wrapper)
    expect(mocks.api.signUp).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').text()).toBe('La password deve avere almeno 10 caratteri')
    await wrapper.find('#password').setValue('long-enough-pw')
    await submit(wrapper)
    expect(mocks.api.signUp).toHaveBeenCalledWith({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'long-enough-pw' })
  })
})
