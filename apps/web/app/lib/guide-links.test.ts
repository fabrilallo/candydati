import { describe, expect, it } from 'vitest'
import { guideUrl } from './guide-links'

describe('guideUrl', () => {
  it('points to the page of the guide in the interface language', () => {
    expect(guideUrl('migration', 'it')).toBe('https://fabrilallo.github.io/candydati/it/guide/migration')
    expect(guideUrl('migration', 'en')).toBe('https://fabrilallo.github.io/candydati/guide/migration')
  })
})
