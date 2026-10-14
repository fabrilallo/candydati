import { describe, expect, it } from 'vitest'
import { publicOriginOf } from './public-origin'

describe('publicOriginOf', () => {
  it('takes host and protocol from the configured site URL', () => {
    expect(publicOriginOf('https://jobs.example.com', { host: 'evil.test', protocol: 'http' })).toEqual({ host: 'jobs.example.com', protocol: 'https' })
    expect(publicOriginOf('http://localhost:3000', { host: 'x', protocol: 'https' })).toEqual({ host: 'localhost:3000', protocol: 'http' })
  })
  it('falls back to what the connection says when the site URL is unusable', () => {
    expect(publicOriginOf('', { host: 'localhost:3000', protocol: 'http' })).toEqual({ host: 'localhost:3000', protocol: 'http' })
    expect(publicOriginOf('not a url', { host: 'h', protocol: 'https' })).toEqual({ host: 'h', protocol: 'https' })
  })
})
