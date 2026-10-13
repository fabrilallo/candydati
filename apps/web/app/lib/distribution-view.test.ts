import { describe, expect, it } from 'vitest'
import { curlExample, feedUrl, hasRegisteredChannels, jobRows, llmsUrl, publicApiUrl, publicJobApiUrl, safeExternalUrl, sitemapUrl, statusLabelKey, statusTone } from './distribution-view'
import { distributionOverviewSchema, jobDistributionSchema } from './phase7-contract'

const SITE = 'https://ats.example.com/'

describe('public urls', () => {
  it('builds stable path urls from the site url', () => {
    expect(feedUrl(SITE, 'acme-27423')).toBe('https://ats.example.com/careers/acme-27423/jobs.xml')
    expect(llmsUrl(SITE, 'acme')).toBe('https://ats.example.com/careers/acme/llms.txt')
    expect(sitemapUrl('http://localhost:3000', 'acme')).toBe('http://localhost:3000/careers/acme/sitemap.xml')
    expect(publicApiUrl(SITE, 'acme')).toBe('https://ats.example.com/api/v1/public/organizations/acme/jobs')
    expect(publicJobApiUrl(SITE, 'acme', 'dev-1')).toBe('https://ats.example.com/api/v1/public/organizations/acme/jobs/dev-1')
  })

  it('encodes slugs and builds a copyable curl', () => {
    expect(feedUrl(SITE, 'a b')).toContain('/careers/a%20b/')
    expect(curlExample('https://x/y')).toBe("curl -H 'Accept: application/json' 'https://x/y'")
  })
})

describe('status mapping', () => {
  it('maps every status to a tone and a label key', () => {
    expect(statusTone('feed')).toBe('success')
    expect(statusTone('pending')).toBe('warning')
    expect(statusTone('failed')).toBe('destructive')
    expect(statusTone('removed')).toBe('outline')
    expect(statusLabelKey('failed')).toBe('distribution.status.failed')
  })

  it('treats an unknown status as pending', () => {
    const [row] = jobDistributionSchema.parse([{ channelId: 'x', status: 'weird' }])
    expect(row?.status).toBe('pending')
  })
})

describe('jobRows', () => {
  const base = { feedUrl: 'f', apiUrl: 'a' }
  it('shows the feed row and the public api row when no channel is registered', () => {
    const rows = jobRows({ ...base, channels: [], published: true })
    expect(rows.map((row) => [row.id, row.status])).toEqual([['feed', 'feed'], ['api', null]])
    expect(hasRegisteredChannels(rows)).toBe(false)
  })

  it('computes the feed as removed while the job is not published', () => {
    expect(jobRows({ ...base, channels: [], published: false })[0]?.status).toBe('removed')
  })

  it('prefers the feed row the api sent and lists registered channels between feed and api', () => {
    const channels = jobDistributionSchema.parse([
      { channelId: 'feed', label: 'Feed XML', status: 'published', updatedAt: '2026-10-13T10:00:00Z' },
      { channelId: 'board', label: 'Board', status: 'failed', error: 'timeout', url: 'https://board.example/1' },
    ])
    const rows = jobRows({ ...base, channels, published: true })
    expect(rows.map((row) => row.id)).toEqual(['feed', 'board', 'api'])
    expect(rows[0]?.status).toBe('feed')
    expect(rows[1]).toMatchObject({ syncable: true, error: 'timeout', label: 'Board' })
    expect(hasRegisteredChannels(rows)).toBe(true)
  })

  it('leaves the api row out without a slug', () => {
    expect(jobRows({ feedUrl: 'f', apiUrl: null, channels: [], published: true }).map((row) => row.id)).toEqual(['feed'])
  })
})

describe('safeExternalUrl', () => {
  it('only lets http(s) through', () => {
    expect(safeExternalUrl('https://a.example/x')).toBe('https://a.example/x')
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('nope')).toBeNull()
    expect(safeExternalUrl(null)).toBeNull()
  })
})

describe('overview schema', () => {
  it('accepts a bare list or an object, defaulting to no channels', () => {
    expect(distributionOverviewSchema.parse([{ id: 'a', label: 'A' }]).channels[0]).toMatchObject({ channelId: 'a', enabled: true, builtIn: false })
    expect(distributionOverviewSchema.parse({}).channels).toEqual([])
  })
})
