import { describe, expect, it } from 'vitest'
import { accentVerdict, normalizeHex } from './careers-theme-view'

describe('normalizeHex', () => {
  it('accepts six hex digits with or without the hash, lower cased', () => {
    expect(normalizeHex('#1F47D6')).toBe('#1f47d6')
    expect(normalizeHex(' 0b6e4f ')).toBe('#0b6e4f')
    expect(normalizeHex('#fff')).toBeNull()
    expect(normalizeHex('blue')).toBeNull()
  })
})

describe('accentVerdict', () => {
  it('passes a dark accent with light text and refuses a mid grey', () => {
    expect(accentVerdict('#1f47d6')).toMatchObject({ foreground: '#f6f7f9', passes: true })
    expect(accentVerdict('#1f47d6').ratio).toBeGreaterThan(4.5)
    const grey = accentVerdict('#777777')
    expect(grey.passes).toBe(false)
    expect(grey.ratio).toBeLessThan(4.5)
  })

  it('rounds down, so a shown 4.5 always passes', () => {
    expect(accentVerdict('#ffff00')).toMatchObject({ foreground: '#111318', passes: true })
  })
})
