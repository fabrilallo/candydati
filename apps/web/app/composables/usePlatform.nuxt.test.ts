import { describe, expect, it } from 'vitest'

describe('usePlatform', () => {
  it('exposes a frozen config with a non-empty product name and a supported default locale', () => {
    const platform = usePlatform().value
    expect(platform.name.length).toBeGreaterThan(0)
    expect(['it', 'en']).toContain(platform.defaultLocale)
    expect(Object.isFrozen(platform)).toBe(true)
  })
})
