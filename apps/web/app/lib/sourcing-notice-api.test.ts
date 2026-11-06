import { describe, expect, it } from 'vitest'
import { ApiFailure } from './api-call'
import { sourcingNoticeFailure } from './sourcing-notice-api'

const failure = (status: number) => new ApiFailure('x', { status, code: 'x', message: 'x' } as never)

describe('sourcingNoticeFailure', () => {
  it('says the link is not valid for unknown or erased links, and tells rate limits and outages apart', () => {
    expect(sourcingNoticeFailure(failure(404))).toBe('invalid')
    expect(sourcingNoticeFailure(failure(429))).toBe('rateLimited')
    expect(sourcingNoticeFailure(failure(500))).toBe('unavailable')
    expect(sourcingNoticeFailure(new Error('network'))).toBe('unavailable')
  })
})
