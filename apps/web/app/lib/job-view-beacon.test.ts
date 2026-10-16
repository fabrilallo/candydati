import { describe, expect, it, vi } from 'vitest'
import { jobViewUrl, sendJobView, type BeaconEnvironment } from './job-view-beacon'

const env = (overrides: Partial<BeaconEnvironment> = {}): BeaconEnvironment & { sent: string[] } => {
  const sent: string[] = []
  return { search: '', referrer: '', host: 'jobs.example.com', doNotTrack: false, send: (url) => (sent.push(url), true), ...overrides, sent }
}

describe('jobViewUrl', () => {
  it('puts the source and the campaign in the query, encoded', () => {
    expect(jobViewUrl('acme', 'backend', { source: 'linkedin', campaign: 'autumn' })).toBe('/api/v1/public/organizations/acme/jobs/backend/view?source=linkedin&campaign=autumn')
    expect(jobViewUrl('a b', 'c/d', { source: 'direct', campaign: '' })).toBe('/api/v1/public/organizations/a%20b/jobs/c%2Fd/view?source=direct')
  })
})

describe('sendJobView', () => {
  it('sends the sanitized source and campaign of the ad URL', () => {
    const e = env({ search: '?utm_source=LinkedIn&utm_campaign=Autumn%202026&utm_medium=social' })
    expect(sendJobView('acme', 'backend', e)).toBe(true)
    expect(e.sent).toEqual(['/api/v1/public/organizations/acme/jobs/backend/view?source=linkedin&campaign=autumn-2026'])
  })

  it('falls back to the referrer host, then direct, and never sends a full URL or an email', () => {
    const viaReferrer = env({ referrer: 'https://www.google.com/search?q=mario.rossi@example.org' })
    sendJobView('acme', 'backend', viaReferrer)
    expect(viaReferrer.sent[0]).toContain('source=google.com')
    expect(viaReferrer.sent[0]).not.toContain('search')
    const personal = env({ search: '?utm_source=mario.rossi%40example.org&utm_campaign=a%40b.it' })
    sendJobView('acme', 'backend', personal)
    expect(personal.sent[0]).toBe('/api/v1/public/organizations/acme/jobs/backend/view?source=direct')
  })

  it('sends nothing to a visitor who asked not to be measured', () => {
    const send = vi.fn(() => true)
    expect(sendJobView('acme', 'backend', env({ doNotTrack: true, send }))).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })
})
