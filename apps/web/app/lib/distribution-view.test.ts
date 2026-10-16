import { describe, expect, it } from 'vitest'
import { distributionOverviewSchema, jobDistributionSchema } from '@candydati/domain'
import { curlExample, feedUrl, hasRegisteredChannels, jobRows, llmsUrl, publicApiUrl, publicJobApiUrl, rowStatusLabelKey, safeExternalUrl, sitemapUrl, statusLabelKey, statusTone } from './distribution-view'

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
    expect(statusTone('published')).toBe('success')
    expect(statusTone('pending')).toBe('warning')
    expect(statusTone('failed')).toBe('destructive')
    expect(statusTone('removed')).toBe('outline')
    expect(statusLabelKey('failed')).toBe('distribution.status.failed')
  })

  it('labels the built-in feed row "in the feed" while published, any other row by its status', () => {
    expect(rowStatusLabelKey({ status: 'published', builtIn: true })).toBe('distribution.status.feed')
    expect(rowStatusLabelKey({ status: 'published', builtIn: false })).toBe('distribution.status.published')
    expect(rowStatusLabelKey({ status: 'removed', builtIn: true })).toBe('distribution.status.removed')
    expect(rowStatusLabelKey({ status: null, builtIn: false })).toBeNull()
  })
})

describe('jobRows', () => {
  const base = { feedUrl: 'f', apiUrl: 'a' }
  const feedRow = { channelId: 'feed', label: 'Feed XML', status: 'published', url: null, error: null, updatedAt: '2026-10-13T10:00:00.000Z' } as const
  const board = { channelId: 'board', label: 'Board', status: 'failed', error: 'timeout', url: 'https://board.example/1', updatedAt: null } as const

  it('shows the feed row and the public api row when no channel is registered', () => {
    const rows = jobRows({ ...base, channels: [feedRow] })
    expect(rows.map((row) => [row.id, row.status])).toEqual([['feed', 'published'], ['api', null]])
    expect(hasRegisteredChannels(rows)).toBe(false)
  })

  it('takes the feed status from the row the api sent', () => {
    expect(jobRows({ ...base, channels: [{ ...feedRow, status: 'removed' }] })[0]?.status).toBe('removed')
    expect(jobRows({ ...base, channels: [] })[0]?.status).toBeNull()
  })

  it('lists registered channels between feed and api', () => {
    const rows = jobRows({ ...base, channels: jobDistributionSchema.parse([feedRow, board]) })
    expect(rows.map((row) => row.id)).toEqual(['feed', 'board', 'api'])
    expect(rows[0]).toMatchObject({ builtIn: true, updatedAt: feedRow.updatedAt })
    expect(rows[1]).toMatchObject({ syncable: true, error: 'timeout', label: 'Board', builtIn: false })
    expect(hasRegisteredChannels(rows)).toBe(true)
  })

  it('leaves the api row out without a slug', () => {
    expect(jobRows({ feedUrl: 'f', apiUrl: null, channels: [feedRow] }).map((row) => row.id)).toEqual(['feed'])
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
  it('needs the feed and llms.txt urls', () => {
    expect(distributionOverviewSchema.safeParse({ channels: [] }).success).toBe(false)
  })
})
