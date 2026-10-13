import { describe, expect, it } from 'vitest'
import { buildSubmission, checkRequestForm, checkSubmission, feedbackStageName, groupRequests, recommendationKey } from './feedback-view'
import { FEEDBACK_TEMPLATES, type FeedbackRequestDto } from '@tt/domain'

const req = (id: string, status: FeedbackRequestDto['status']): FeedbackRequestDto => ({
  id,
  applicationId: 'a',
  stageId: 's',
  stageLabel: 'Tecnico',
  interviewerKind: 'external',
  interviewerName: 'Ada',
  status,
  remindersSent: 0,
  createdAt: '2026-10-01T10:00:00.000Z',
  expiresAt: '2026-10-15T10:00:00.000Z',
  submittedAt: null,
})

const technical = FEEDBACK_TEMPLATES.technical_interview.map((question) => question.id)

describe('feedback view', () => {
  it('groups requests by status, expired ones as overdue', () => {
    const grouped = groupRequests([req('a', 'pending'), req('c', 'expired'), req('d', 'submitted')])
    expect(grouped.pending.map((r) => r.id)).toEqual(['a'])
    expect(grouped.overdue.map((r) => r.id)).toEqual(['c'])
    expect(grouped.submitted.map((r) => r.id)).toEqual(['d'])
  })

  it('names recommendations by key', () => {
    expect(recommendationKey('do_not_proceed')).toBe('feedback.recommendation.do_not_proceed')
  })

  it('needs a recommendation and the required questions, as the domain does', () => {
    expect(checkSubmission(technical, { tech_shown: '  ' }, null).issues).toEqual(['recommendation_required', 'answers_required'])
    expect(checkSubmission(technical, { tech_shown: 'ok' }, 'proceed').issues).toEqual(['answers_required'])
    expect(checkSubmission(technical, { tech_shown: 'ok', tech_open: 'more' }, 'proceed')).toMatchObject({ ok: true, issues: [] })
    expect(checkSubmission(technical, {}, 'discuss').issues).toEqual(['answers_required'])
  })

  it('checks the fallback form of a stage that no longer exists', () => {
    expect(checkSubmission(['general_shown', 'general_open'], { general_shown: 'x' }, 'discuss').ok).toBe(false)
    expect(checkSubmission(['general_shown', 'general_open'], { general_shown: 'x', general_open: 'y' }, 'discuss').ok).toBe(true)
  })

  it('refuses answers over the limit', () => {
    const check = checkSubmission(technical, { tech_shown: 'x'.repeat(2001), tech_open: 'ok' }, 'proceed')
    expect(check.ok).toBe(false)
    expect(check.tooLong).toEqual(['tech_shown'])
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
