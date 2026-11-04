import { SHORTLIST_REASON_MAX } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { ApiFailure } from './api-call'
import { answerFailure, answeredCount, checkAnswer, replaceCandidate } from './public-shortlist-view'

const failure = (status: number, code: string | null = null) => new ApiFailure('x', { status, code, message: null, issues: [] })
const candidate = (itemId: string, answer: 'meet' | 'not_for_us' | null = null) => ({ itemId, firstName: 'A', lastName: 'B', hasCv: false, notes: [], answer, answerReason: null, answeredAt: null })

describe('checkAnswer', () => {
  it('asks for a choice and a reason of 3 to 500 characters', () => {
    expect(checkAnswer(null, '')).toEqual(['choice', 'reason'])
    expect(checkAnswer('meet', '  ok ')).toEqual(['reason'])
    expect(checkAnswer('meet', 'x'.repeat(SHORTLIST_REASON_MAX + 1))).toEqual(['reason'])
    expect(checkAnswer('not_for_us', 'Troppo junior')).toEqual([])
  })
})

describe('answerFailure', () => {
  it('tells an invalid link from an answer already given and a refused reason', () => {
    expect(answerFailure(failure(404))).toBe('invalid')
    expect(answerFailure(failure(409))).toBe('alreadyAnswered')
    expect(answerFailure(failure(422))).toBe('reason')
    expect(answerFailure(failure(500))).toBe('unavailable')
    expect(answerFailure(new Error('x'))).toBe('unavailable')
  })
})

describe('candidates', () => {
  it('replaces one candidate without touching the list, and counts the answers', () => {
    const list = [candidate('i1'), candidate('i2')]
    const next = replaceCandidate(list, candidate('i2', 'meet'))
    expect(list[1]?.answer).toBeNull()
    expect(next.map((c) => c.answer)).toEqual([null, 'meet'])
    expect(answeredCount(next)).toBe(1)
  })
})
