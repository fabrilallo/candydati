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
    mocks.api.signIn.mockResolvedValue({ twoFactor: false })
    mocks.api.signUp.mockResolvedValue({ confirmed: false })
    mocks.api.getSession.mockResolvedValue(null)
  })

  it('signs in with email and password, then goes to the app', async () => {
    const wrapper = await mountSuspended(AuthForm, { props: { mode: 'login' } })
    await wrapper.find('#email').setValue('ada@example.com')
    await wrapper.find('#password').setValue('secret-pass')
    await submit(wrapper)
    expect(mocks.api.signIn).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'secret-pass', callbackURL: '/verify-email?next=%2Fonboarding' })
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
    expect(mocks.api.signUp).toHaveBeenCalledWith({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'long-enough-pw', callbackURL: '/verify-email?next=%2Fonboarding' })
    expect(mocks.navigateTo).toHaveBeenCalledWith({ path: '/verify-email', query: { email: 'ada@example.com' } })
    expect(mocks.api.getSession).not.toHaveBeenCalled()
  })

  it('sends an unconfirmed address to the inbox page instead of an error', async () => {
    mocks.api.signIn.mockRejectedValue(new AppError('errors.emailNotVerified', 'EMAIL_NOT_VERIFIED'))
    const wrapper = await mountSuspended(AuthForm, { props: { mode: 'login' } })
    await wrapper.find('#email').setValue('ada@example.com')
    await wrapper.find('#password').setValue('secret-pass')
    await submit(wrapper)
    expect(mocks.navigateTo).toHaveBeenCalledWith({ path: '/verify-email', query: { email: 'ada@example.com' } })
  })

  it('asks for the second factor when the account has one', async () => {
    mocks.api.signIn.mockResolvedValue({ twoFactor: true })
    const wrapper = await mountSuspended(AuthForm, { props: { mode: 'login' } })
    await wrapper.find('#email').setValue('ada@example.com')
    await wrapper.find('#password').setValue('secret-pass')
    await submit(wrapper)
    expect(mocks.navigateTo).toHaveBeenCalledWith({ path: '/two-factor', query: {} })
    expect(wrapper.find('[data-testid="forgot-password-link"]').attributes('href')).toBe('/forgot-password')
  })

  it('asks the first owner for the setup token only on /signup?setup, and passes it on', async () => {
    const plain = await mountSuspended(AuthForm, { props: { mode: 'signup' }, route: '/signup' })
    expect(plain.find('#setup-token').exists()).toBe(false)
    const wrapper = await mountSuspended(AuthForm, { props: { mode: 'signup' }, route: '/signup?setup' })
    await wrapper.find('#name').setValue('Ada Lovelace')
    await wrapper.find('#email').setValue('ada@example.com')
    await wrapper.find('#password').setValue('long-enough-pw')
    await wrapper.find('#setup-token').setValue('one-time-token')
    await submit(wrapper)
    expect(mocks.api.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@example.com', bootstrapToken: 'one-time-token' }))
  })

  it('fills the setup token from the #code= of the link the api logs, then drops it from the address', async () => {
    const wrapper = await mountSuspended(AuthForm, { props: { mode: 'signup' }, route: '/signup?setup#code=derived-setup-code' })
    await vi.waitUntil(() => useRouter().currentRoute.value.hash === '', { timeout: 1000 })
    expect((wrapper.find('#setup-token').element as HTMLInputElement).value).toBe('derived-setup-code')
    expect(useRouter().currentRoute.value.hash).toBe('')
    expect(useRouter().currentRoute.value.query).toHaveProperty('setup')
    await wrapper.find('#name').setValue('Ada Lovelace')
    await wrapper.find('#email').setValue('ada@example.com')
    await wrapper.find('#password').setValue('long-enough-pw')
    await submit(wrapper)
    expect(mocks.api.signUp).toHaveBeenCalledWith(expect.objectContaining({ bootstrapToken: 'derived-setup-code' }))
  })

  it('signs the first owner in at once when the setup code confirmed the address (no email needed yet)', async () => {
    mocks.api.signUp.mockResolvedValueOnce({ confirmed: true })
    const wrapper = await mountSuspended(AuthForm, { props: { mode: 'signup' }, route: '/signup?setup' })
    await wrapper.find('#name').setValue('Ada Lovelace')
    await wrapper.find('#email').setValue('ada@example.com')
    await wrapper.find('#password').setValue('long-enough-pw')
    await wrapper.find('#setup-token').setValue('setup-code')
    await submit(wrapper)
    expect(mocks.api.signIn).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@example.com', password: 'long-enough-pw' }))
    expect(mocks.navigateTo).toHaveBeenCalledWith('/onboarding')
  })
})
