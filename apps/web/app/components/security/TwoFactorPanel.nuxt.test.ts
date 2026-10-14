import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { AppError } from '@/lib/auth-errors'
import TwoFactorPanel from './TwoFactorPanel.vue'

const mocks = vi.hoisted(() => ({
  api: { enableTwoFactor: vi.fn(), verifyTotp: vi.fn(), disableTwoFactor: vi.fn() },
  twoFactorEnabled: { value: false },
  refresh: vi.fn(),
}))
mockNuxtImport('useAuthApi', () => () => mocks.api)
mockNuxtImport('useViewer', () => () => {
  const viewer = ref({ user: { id: 'u1', name: 'Ada', email: 'a@b.co', twoFactorEnabled: mocks.twoFactorEnabled.value }, organization: null, role: 'owner' })
  return { viewer, refresh: mocks.refresh, ensure: vi.fn(), clear: vi.fn() }
})

const URI = 'otpauth://totp/Acme:a@b.co?secret=JBSWY3DPEHPK3PXP&issuer=Acme'

describe('TwoFactorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.twoFactorEnabled.value = false
    mocks.api.enableTwoFactor.mockResolvedValue({ totpUri: URI, backupCodes: ['aaaa-1111', 'bbbb-2222'] })
    mocks.api.verifyTotp.mockResolvedValue(undefined)
  })

  it('enrols: password, key for the app, confirmation code, then the backup codes once', async () => {
    const wrapper = await mountSuspended(TwoFactorPanel, { props: { required: true } })
    expect(wrapper.find('[role="alert"]').text()).toMatch(/organizzazione/)
    await wrapper.find('[data-testid="two-factor-password"]').setValue('my-password')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(mocks.api.enableTwoFactor).toHaveBeenCalledWith('my-password')
    expect(wrapper.find('[data-testid="two-factor-secret"]').text()).toBe('JBSW Y3DP EHPK 3PXP')
    await wrapper.find('[data-testid="two-factor-code"]').setValue('123 456')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(mocks.api.verifyTotp).toHaveBeenCalledWith('123456')
    expect(mocks.refresh).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="two-factor-backup-codes"]').text()).toContain('aaaa-1111')
  })

  it('shows a wrong code and keeps the enrolment open', async () => {
    mocks.api.verifyTotp.mockRejectedValue(new AppError('errors.invalidCode', 'INVALID_CODE'))
    const wrapper = await mountSuspended(TwoFactorPanel, { props: { required: false } })
    await wrapper.find('[data-testid="two-factor-password"]').setValue('pw')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await wrapper.find('[data-testid="two-factor-code"]').setValue('000000')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('Il codice non è corretto')
    expect(wrapper.find('[data-testid="two-factor-code"]').exists()).toBe(true)
  })

  it('turns it off with the password when it is on', async () => {
    mocks.twoFactorEnabled.value = true
    const wrapper = await mountSuspended(TwoFactorPanel, { props: { required: false } })
    expect(wrapper.find('[data-testid="two-factor-status"]').text()).toBe('Attiva')
    await wrapper.find('[data-testid="two-factor-password"]').setValue('pw')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(mocks.api.disableTwoFactor).toHaveBeenCalledWith('pw')
  })
})
