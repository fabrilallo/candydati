import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/auth-errors'
import { viewerWith } from '~~/test/fixtures/job-fixtures'
import ForgotPassword from './forgot-password.vue'
import Login from './login.vue'
import Onboarding from './onboarding.vue'
import ResetPassword from './reset-password.vue'
import Signup from './signup.vue'
import TwoFactor from './two-factor.vue'
import VerifyEmail from './verify-email.vue'

const mocks = vi.hoisted(() => ({
  api: {
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    verifyTotp: vi.fn(),
    verifyBackupCode: vi.fn(),
    sendVerificationEmail: vi.fn(),
    getSession: vi.fn(),
  },
  navigateTo: vi.fn(),
}))
mockNuxtImport('useAuthApi', () => () => mocks.api)
mockNuxtImport('navigateTo', () => mocks.navigateTo)

const submit = async (wrapper: Awaited<ReturnType<typeof mountSuspended>>): Promise<void> => {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.api.getSession.mockResolvedValue(null)
  useViewer().viewer.value = null
})

describe('login and signup pages', () => {
  it('login: shows the form and keeps the redirect when going to sign up', async () => {
    const wrapper = await mountSuspended(Login, { route: '/login?redirect=%2Fapp%2Fjobs' })
    expect(wrapper.find('h1').text()).toBe('Accedi')
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.find('a[href^="/signup"]').attributes('href')).toBe('/signup?redirect=/app/jobs')
  })

  it('signup: shows the form and links back to login without a redirect', async () => {
    const wrapper = await mountSuspended(Signup, { route: '/signup' })
    expect(wrapper.find('h1').exists()).toBe(true)
    expect(wrapper.find('a[href="/login"]').exists()).toBe(true)
  })

  it('signup: keeps the redirect for the login link', async () => {
    const wrapper = await mountSuspended(Signup, { route: '/signup?redirect=%2Fapp' })
    expect(wrapper.find('a[href^="/login"]').attributes('href')).toBe('/login?redirect=/app')
  })
})

describe('forgot password page', () => {
  it('asks for the address and shows the same confirmation whoever it is', async () => {
    mocks.api.requestPasswordReset.mockResolvedValue(undefined)
    const wrapper = await mountSuspended(ForgotPassword)
    await wrapper.find('#email').setValue('ada@example.com')
    await submit(wrapper)
    expect(mocks.api.requestPasswordReset).toHaveBeenCalledWith({ email: 'ada@example.com', redirectTo: '/reset-password' })
    expect(wrapper.find('[data-testid="forgot-password-sent"]').text()).toContain('ada@example.com')
  })

  it('validates the address before calling the api', async () => {
    const wrapper = await mountSuspended(ForgotPassword)
    await wrapper.find('#email').setValue('not-an-email')
    await submit(wrapper)
    expect(mocks.api.requestPasswordReset).not.toHaveBeenCalled()
    expect(wrapper.find('#email').attributes('aria-invalid')).toBe('true')
  })

  it('shows the api error and stays on the form', async () => {
    mocks.api.requestPasswordReset.mockRejectedValue(new AppError('errors.generic'))
    const wrapper = await mountSuspended(ForgotPassword)
    await wrapper.find('#email').setValue('ada@example.com')
    await submit(wrapper)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="forgot-password-sent"]').exists()).toBe(false)
  })
})

describe('reset password page', () => {
  it('says the link is not valid without a token', async () => {
    const wrapper = await mountSuspended(ResetPassword, { route: '/reset-password' })
    expect(wrapper.find('[data-testid="reset-password-invalid"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/forgot-password"]').exists()).toBe(true)
  })

  it('says the link is not valid when the api reports an error', async () => {
    const wrapper = await mountSuspended(ResetPassword, { route: '/reset-password?error=INVALID_TOKEN&token=abc' })
    expect(wrapper.find('[data-testid="reset-password-invalid"]').exists()).toBe(true)
  })

  it('saves the new password with the token and goes to the login', async () => {
    mocks.api.resetPassword.mockResolvedValue(undefined)
    const wrapper = await mountSuspended(ResetPassword, { route: '/reset-password?token=abc' })
    await wrapper.find('#password').setValue('a-long-enough-password-1')
    await submit(wrapper)
    expect(mocks.api.resetPassword).toHaveBeenCalledWith({ token: 'abc', newPassword: 'a-long-enough-password-1' })
    expect(mocks.navigateTo).toHaveBeenCalledWith('/login')
  })

  it('does not call the api with a short password', async () => {
    const wrapper = await mountSuspended(ResetPassword, { route: '/reset-password?token=abc' })
    await wrapper.find('#password').setValue('short')
    await submit(wrapper)
    expect(mocks.api.resetPassword).not.toHaveBeenCalled()
    expect(mocks.navigateTo).not.toHaveBeenCalled()
  })

  it('stays on the page when the api refuses the token', async () => {
    mocks.api.resetPassword.mockRejectedValue(new AppError('errors.generic'))
    const wrapper = await mountSuspended(ResetPassword, { route: '/reset-password?token=abc' })
    await wrapper.find('#password').setValue('a-long-enough-password-1')
    await submit(wrapper)
    expect(mocks.navigateTo).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })
})

describe('two-factor page', () => {
  it('verifies the authenticator code and goes where the person was heading', async () => {
    mocks.api.verifyTotp.mockResolvedValue(undefined)
    const wrapper = await mountSuspended(TwoFactor, { route: '/two-factor?redirect=%2Fapp%2Fjobs' })
    await wrapper.find('#code').setValue('123456')
    await submit(wrapper)
    expect(mocks.api.verifyTotp).toHaveBeenCalledWith('123456')
    expect(mocks.navigateTo).toHaveBeenCalledWith('/app/jobs')
  })

  it('switches to a backup code and verifies that instead', async () => {
    mocks.api.verifyBackupCode.mockResolvedValue(undefined)
    const wrapper = await mountSuspended(TwoFactor, { route: '/two-factor' })
    await wrapper.find('button[type="button"]').trigger('click')
    expect(wrapper.find('#code').attributes('inputmode')).toBe('text')
    await wrapper.find('#code').setValue('abcd-efgh')
    await submit(wrapper)
    expect(mocks.api.verifyBackupCode).toHaveBeenCalledWith('abcd-efgh')
    expect(mocks.navigateTo).toHaveBeenCalledWith('/app')
  })

  it('shows a wrong code inline and does not navigate', async () => {
    mocks.api.verifyTotp.mockRejectedValue(new AppError('errors.generic'))
    const wrapper = await mountSuspended(TwoFactor, { route: '/two-factor' })
    await wrapper.find('#code').setValue('000000')
    await submit(wrapper)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(mocks.navigateTo).not.toHaveBeenCalled()
  })
})

describe('verify email page', () => {
  it('names the address and resends the confirmation', async () => {
    mocks.api.sendVerificationEmail.mockResolvedValue(undefined)
    const wrapper = await mountSuspended(VerifyEmail, { route: '/verify-email?email=ada%40example.com&next=%2Fonboarding' })
    expect(wrapper.find('[data-testid="verify-email-subtitle"]').text()).toContain('ada@example.com')
    await wrapper.find('[data-testid="verify-email-resend"]').trigger('click')
    await flushPromises()
    expect(mocks.api.sendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@example.com' }))
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })

  it('shows why a resend failed', async () => {
    mocks.api.sendVerificationEmail.mockRejectedValue(new AppError('errors.generic'))
    const wrapper = await mountSuspended(VerifyEmail, { route: '/verify-email?email=ada%40example.com' })
    await wrapper.find('[data-testid="verify-email-resend"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })

  it('says the link expired and offers no resend without an address', async () => {
    const wrapper = await mountSuspended(VerifyEmail, { route: '/verify-email?error=token_expired' })
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="verify-email-resend"]').exists()).toBe(false)
  })

  it('moves on when the person is already confirmed', async () => {
    useViewer().viewer.value = viewerWith('owner')
    await mountSuspended(VerifyEmail, { route: '/verify-email?next=%2Fapp%2Fjobs' })
    expect(mocks.navigateTo).toHaveBeenCalledWith('/app/jobs', { replace: true })
  })
})

describe('onboarding page', () => {
  it('shows the organization form', async () => {
    const wrapper = await mountSuspended(Onboarding)
    expect(wrapper.find('h1').exists()).toBe(true)
    expect(wrapper.find('#org-name').exists()).toBe(true)
  })

  it('goes to the app once the organization exists', async () => {
    const wrapper = await mountSuspended(Onboarding)
    mocks.api.getSession.mockResolvedValue(null)
    wrapper.findComponent({ name: 'OnboardingForm' }).vm.$emit('created')
    await flushPromises()
    expect(mocks.navigateTo).toHaveBeenCalledWith('/app')
  })
})
