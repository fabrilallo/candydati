import { describe, expect, it } from 'vitest'
import { buildSubmission, checkRequestForm, checkSubmission, feedbackStageName, groupRequests, isRecommendation, recommendationKey } from './feedback-view'
import type { FeedbackRequestDto } from './phase9-contract'

const req = (id: string, state: FeedbackRequestDto['state']): FeedbackRequestDto => ({
  id,
  stageId: 's',
  stageLabel: null,
  interviewer: { kind: 'external', userId: null, email: null, name: 'Ada' },
  state,
  requestedAt: '2026-10-01T10:00:00.000Z',
  expiresAt: null,
  submittedAt: null,
})

describe('feedback view', () => {
  it('groups requests by state, expired among the overdue', () => {
    const grouped = groupRequests([req('a', 'pending'), req('b', 'overdue'), req('c', 'expired'), req('d', 'submitted')])
    expect(grouped.pending.map((r) => r.id)).toEqual(['a'])
    expect(grouped.overdue.map((r) => r.id)).toEqual(['b', 'c'])
    expect(grouped.submitted.map((r) => r.id)).toEqual(['d'])
  })

  it('names recommendations by key and recognises them', () => {
    expect(recommendationKey('do_not_proceed')).toBe('feedback.recommendation.do_not_proceed')
    expect(isRecommendation('discuss')).toBe(true)
    expect(isRecommendation('score')).toBe(false)
    expect(isRecommendation(3)).toBe(false)
  })

  it('needs a recommendation and one answer with words', () => {
    expect(checkSubmission({ a: '  ' }, null).issues).toEqual(['recommendation_required', 'answers_required'])
    expect(checkSubmission({ a: 'ok' }, 'proceed')).toMatchObject({ ok: true, issues: [] })
    expect(checkSubmission({}, 'discuss').issues).toEqual(['answers_required'])
  })

  it('refuses answers over the limit', () => {
    const check = checkSubmission({ a: 'x'.repeat(2001), b: 'ok' }, 'proceed')
    expect(check.ok).toBe(false)
    expect(check.tooLong).toEqual(['a'])
    expect(check.issues).toEqual(['answer_too_long'])
  })

  it('builds the body trimmed, in order, without empty answers', () => {
    expect(buildSubmission(['a', 'b', 'c'], { c: ' tre ', a: ' uno', b: ' ' }, 'proceed')).toEqual({
      answers: { a: 'uno', c: 'tre' },
      recommendation: 'proceed',
    })
  })

  it('validates the request dialog', () => {
    expect(checkRequestForm({ stageId: '', external: false, name: '', email: '' })).toEqual({ ok: false, errors: { stageId: 'stage_required' } })
    expect(checkRequestForm({ stageId: 's1', external: false, name: 'x', email: 'y' })).toEqual({ ok: true, input: { stageId: 's1' } })
    const bad = checkRequestForm({ stageId: 's1', external: true, name: ' ', email: 'nope' })
    expect(bad).toMatchObject({ ok: false, errors: { name: 'name_required', email: 'email_invalid' } })
    expect(checkRequestForm({ stageId: 's1', external: true, name: ' Ada ', email: ' ada@example.com ' })).toEqual({
      ok: true,
      input: { stageId: 's1', interviewer: { kind: 'external', name: 'Ada', email: 'ada@example.com' } },
    })
  })

  it('names a stage as the application declares it, then by the api label', () => {
    const known = [{ id: 's1', name: 'Tecnico' }]
    expect(feedbackStageName('s1', 'Screening call', known)).toBe('Tecnico')
    expect(feedbackStageName('gone', 'Colloquio', known)).toBe('Colloquio')
    expect(feedbackStageName('s1', null, known)).toBe('Tecnico')
    expect(feedbackStageName('zz', null, known)).toBe('')
  })
})
