import { describe, expect, it } from 'vitest'
import { isNamedOrigin, originLabel, originText } from './origin-label'

const t = (key: string, params?: Record<string, unknown>): string => (params ? `${key}:${JSON.stringify(params)}` : key)

describe('origin labels', () => {
  it('names the system origins, the preset channels and keeps any other source as stored', () => {
    expect(originLabel('direct', t)).toBe('reports.sources.named.direct')
    expect(originLabel('manual', t)).toBe('reports.sources.named.manual')
    expect(originLabel('linkedin', t)).toBe('LinkedIn')
    expect(originLabel('referral', t)).toBe('trackedLinks.presets.referral')
    expect(originLabel('google.com', t)).toBe('google.com')
    expect(isNamedOrigin('import')).toBe(true)
    expect(isNamedOrigin('indeed')).toBe(false)
  })

  it('adds the campaign when there is one', () => {
    expect(originText('linkedin', 'autumn-2026', t)).toBe('origin.withCampaign:{"source":"LinkedIn","campaign":"autumn-2026"}')
    expect(originText('direct', null, t)).toBe('reports.sources.named.direct')
    expect(originText('linkedin', '', t)).toBe('LinkedIn')
  })
})
