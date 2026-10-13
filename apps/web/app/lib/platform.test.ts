import { describe, expect, it } from 'vitest'
import { platformFromPublicConfig } from './platform'

describe('platformFromPublicConfig', () => {
  it('reads the name and default locale from the public runtime config', () => {
    const platform = platformFromPublicConfig({ platformName: 'Acme ATS', platformDefaultLocale: 'en', siteUrl: 'https://ats.example/' })
    expect(platform).toMatchObject({ name: 'Acme ATS', defaultLocale: 'en', url: 'https://ats.example' })
  })

  it('falls back to the codename when the name is blank', () => {
    expect(platformFromPublicConfig({ platformName: '', platformDefaultLocale: 'it', siteUrl: '' }).name).toBe('team-tracker')
  })

  it('is frozen so no screen can mutate it', () => {
    expect(Object.isFrozen(platformFromPublicConfig({ platformName: 'X', platformDefaultLocale: 'it', siteUrl: '' }))).toBe(true)
  })
})
