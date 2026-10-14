import { describe, expect, it, vi } from 'vitest'
import type { JobApiRequest } from './job-api'
import { getSecuritySettings, mustEnrolTwoFactor, setRequireTwoFactor, totpSecretOf } from './security-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const fail = (status: number, code: string) => ({ status, body: { success: false, data: null, error: { code, message: 'x' } } })
const stub = (response: unknown) => vi.fn<JobApiRequest>().mockResolvedValue(response as never)

describe('security api', () => {
  it('reads and changes the 2FA requirement', async () => {
    const request = stub(ok({ requireTwoFactor: true }))
    expect(await getSecuritySettings(request)).toEqual({ requireTwoFactor: true })
    await setRequireTwoFactor(request, true)
    expect(request).toHaveBeenLastCalledWith('/api/v1/settings/security', expect.objectContaining({ method: 'PUT', body: { requireTwoFactor: true } }))
  })

  it('tells when the person must enrol a second factor, and only then', async () => {
    expect(await mustEnrolTwoFactor(stub(fail(403, 'two_factor_required')))).toBe(true)
    expect(await mustEnrolTwoFactor(stub(fail(403, 'forbidden')))).toBe(false)
    expect(await mustEnrolTwoFactor(stub(ok({ requireTwoFactor: true })))).toBe(false)
  })

  it('reads the secret of an otpauth URI for manual entry', () => {
    expect(totpSecretOf('otpauth://totp/Acme:ada?secret=JBSWY3DPEHPK3PXP&issuer=Acme')).toBe('JBSW Y3DP EHPK 3PXP')
    expect(totpSecretOf('nope')).toBeNull()
  })
})
