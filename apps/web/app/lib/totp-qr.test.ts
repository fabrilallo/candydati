import { describe, expect, it } from 'vitest'
import { totpQrDataUrl } from './totp-qr'

describe('totpQrDataUrl', () => {
  it('draws the setup link as an SVG data URL', async () => {
    const url = await totpQrDataUrl('otpauth://totp/Acme:a@b.co?secret=JBSWY3DPEHPK3PXP&issuer=Acme')
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    const svg = decodeURIComponent(url.slice(url.indexOf(',') + 1))
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/)
    expect(svg).not.toContain('<script')
  })
})
