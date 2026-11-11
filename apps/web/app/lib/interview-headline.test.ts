import { describe, expect, it } from 'vitest'
import { interviewView } from '~~/test/fixtures/interview-fixtures'
import type { InterviewViewDto } from './interview-api'
import { headlineInterview, openInterviewAt } from './interview-headline'

const now = new Date('2026-11-11T12:00:00Z')
const view = (overrides: Record<string, unknown>) => interviewView(overrides) as InterviewViewDto

describe('headlineInterview', () => {
  it('shows the next booked interview first, even when another stage waits for the candidate', () => {
    const list = [
      view({ id: 'p', status: 'proposed', stageId: 'b' }),
      view({ id: 'later', status: 'booked', startsAt: '2026-11-20T09:00:00.000Z' }),
      view({ id: 'next', status: 'booked', startsAt: '2026-11-12T13:30:00.000Z' }),
    ]
    expect(headlineInterview(list, now)?.id).toBe('next')
  })

  it('falls back to the proposal still waiting for the candidate', () => {
    expect(headlineInterview([view({ id: 'p', status: 'proposed' })], now)?.id).toBe('p')
  })

  it('leaves out what is cancelled or already over', () => {
    const list = [view({ status: 'cancelled' }), view({ status: 'booked', startsAt: '2026-11-10T09:00:00.000Z', endsAt: '2026-11-10T10:00:00.000Z' })]
    expect(headlineInterview(list, now)).toBeNull()
    expect(headlineInterview([], now)).toBeNull()
  })
})

describe('openInterviewAt', () => {
  it('finds the proposed or booked interview of a stage, never a cancelled one', () => {
    const list = [view({ id: 'c', status: 'cancelled', stageId: 's1' }), view({ id: 'o', status: 'booked', stageId: 's1', startsAt: '2026-11-12T13:30:00.000Z' })]
    expect(openInterviewAt(list, 's1')?.id).toBe('o')
    expect(openInterviewAt(list, 's2')).toBeNull()
    expect(openInterviewAt([view({ status: 'cancelled', stageId: 's1' })], 's1')).toBeNull()
  })
})
