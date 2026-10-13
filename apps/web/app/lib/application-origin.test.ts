import { describe, expect, it } from 'vitest'
import { applicationOrigin } from './application-origin'

const at = (search: string, referrer = '', host = 'jobs.example.com') => applicationOrigin({ search, referrer, host })

describe('applicationOrigin', () => {
  it('prefers utm_source, then ref, from the ad URL', () => {
    expect(at('?utm_source=LinkedIn&ref=other')).toBe('linkedin')
    expect(at('?ref=Newsletter')).toBe('newsletter')
    expect(at('ref=telegram')).toBe('telegram')
  })

  it('sanitizes what the URL says to a short label', () => {
    expect(at('?utm_source=Info%20Jobs%20/%20Ottobre!!')).toBe('info-jobs-ottobre')
    expect(at(`?utm_source=${'x'.repeat(80)}`)).toHaveLength(60)
    expect(at('?utm_source=%3Cscript%3E')).toBe('script')
  })

  it('never keeps an email address from the query', () => {
    expect(at('?utm_source=mario.rossi%40example.com')).toBe('direct')
  })

  it('falls back to the referrer host when the query has nothing usable', () => {
    expect(at('?utm_source=%20%20', 'https://www.Google.com/search?q=lavoro')).toBe('google.com')
    expect(at('', 'https://t.co/abc')).toBe('t.co')
  })

  it('ignores a referrer from the same host (moving inside the careers pages)', () => {
    expect(at('', 'https://jobs.example.com/careers/acme')).toBe('direct')
    expect(at('', 'https://www.jobs.example.com/careers/acme', 'jobs.example.com:3000')).toBe('direct')
  })

  it('never keeps a path, a query or credentials of the referrer', () => {
    expect(at('', 'https://user:secret@forum.example.org:8443/thread/42?mail=a@b.it')).toBe('forum.example.org')
  })

  it('is direct with no query and no referrer, or an unreadable referrer', () => {
    expect(at('')).toBe('direct')
    expect(at('', 'not a url')).toBe('direct')
  })
})
