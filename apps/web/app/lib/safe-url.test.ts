import { describe, expect, it } from 'vitest'
import { safeExternalUrl, safeImageUrl } from './safe-url'

describe('safeExternalUrl', () => {
  it('keeps http(s) and drops everything else', () => {
    expect(safeExternalUrl('https://a.example/x')).toBe('https://a.example/x')
    expect(safeExternalUrl('http://a.example/x')).toBe('http://a.example/x')
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('data:text/html,x')).toBeNull()
    expect(safeExternalUrl('nope')).toBeNull()
    expect(safeExternalUrl(null)).toBeNull()
    expect(safeExternalUrl(undefined)).toBeNull()
  })
})

describe('safeImageUrl', () => {
  it('is https only', () => {
    expect(safeImageUrl('https://a.example/l.png')).toBe('https://a.example/l.png')
    expect(safeImageUrl('http://a.example/l.png')).toBeNull()
    expect(safeImageUrl('javascript:alert(1)')).toBeNull()
  })
})
