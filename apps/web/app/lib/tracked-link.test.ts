import { describe, expect, it } from 'vitest'
import { buildTrackedLink, channelLabel, CHANNEL_PRESETS, trackedLabels } from './tracked-link'

const JOB = 'https://jobs.example.com/careers/acme/backend-1'

describe('CHANNEL_PRESETS', () => {
  it('offers the channels recruiters use, each already a clean source label', () => {
    expect(CHANNEL_PRESETS.map((p) => p.source)).toEqual(['linkedin', 'indeed', 'infojobs', 'glassdoor', 'facebook', 'instagram', 'x', 'newsletter', 'referral', 'career-fair', 'university'])
    for (const preset of CHANNEL_PRESETS) expect(trackedLabels({ source: preset.source, campaign: '' }).source).toBe(preset.source)
  })
})

describe('buildTrackedLink', () => {
  it('adds utm_source and utm_campaign to the public ad URL', () => {
    expect(buildTrackedLink({ jobUrl: JOB, source: 'linkedin', campaign: 'autumn' })?.url).toBe(`${JOB}?utm_source=linkedin&utm_campaign=autumn`)
  })

  it('leaves the campaign out when there is none', () => {
    expect(buildTrackedLink({ jobUrl: JOB, source: 'indeed', campaign: '  ' })).toEqual({ url: `${JOB}?utm_source=indeed`, source: 'indeed', campaign: '' })
  })

  it('sanitizes a custom channel and campaign exactly as the reports will show them', () => {
    const link = buildTrackedLink({ jobUrl: JOB, source: 'Fiera Lavoro / Bologna', campaign: 'Autumn 2026!' })
    expect(link).toMatchObject({ source: 'fiera-lavoro-bologna', campaign: 'autumn-2026' })
    expect(link?.url).toBe(`${JOB}?utm_source=fiera-lavoro-bologna&utm_campaign=autumn-2026`)
  })

  it('keeps an existing query and replaces a previous utm', () => {
    expect(buildTrackedLink({ jobUrl: `${JOB}?lang=it&utm_source=old`, source: 'x', campaign: '' })?.url).toBe(`${JOB}?lang=it&utm_source=x`)
  })

  it('is null without a usable channel, for an email address and for a URL that is not one', () => {
    expect(buildTrackedLink({ jobUrl: JOB, source: '', campaign: 'a' })).toBeNull()
    expect(buildTrackedLink({ jobUrl: JOB, source: 'mario.rossi@example.org', campaign: '' })).toBeNull()
    expect(buildTrackedLink({ jobUrl: 'not a url', source: 'linkedin', campaign: '' })).toBeNull()
  })

  it('gives no link for the origins the product writes itself', () => {
    for (const source of ['direct', 'manual', 'import']) expect(buildTrackedLink({ jobUrl: JOB, source, campaign: '' })).toBeNull()
  })
})

describe('channelLabel', () => {
  it('names a preset the way the select does and shows any other channel as saved', () => {
    const t = (key: string) => `t:${key}`
    expect(channelLabel('linkedin', t)).toBe('LinkedIn')
    expect(channelLabel('career-fair', t)).toBe('t:trackedLinks.presets.career-fair')
    expect(channelLabel('fiera-bologna', t)).toBe('fiera-bologna')
  })
})
