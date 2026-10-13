import { describe, expect, it } from 'vitest'
import { calendarDays, effectiveResponseState, responseCountdown } from './response-countdown'

const TZ = 'Europe/Rome'
const NOW = new Date('2026-10-13T10:00:00.000Z') // 12:00 in Rome
const open = (responseDueAt: string | null, extra: Partial<Parameters<typeof responseCountdown>[0]> = {}) => ({ responseDueAt, respondedAt: null, responseState: null, outcome: null, ...extra })

describe('calendarDays', () => {
  it('counts calendar days in the time zone, not 24 hour blocks', () => {
    expect(calendarDays(NOW, new Date('2026-10-13T21:59:00.000Z'), TZ)).toBe(0)
    expect(calendarDays(NOW, new Date('2026-10-13T22:01:00.000Z'), TZ)).toBe(1)
    expect(calendarDays(NOW, new Date('2026-10-16T09:00:00.000Z'), TZ)).toBe(3)
    expect(calendarDays(new Date('2026-10-11T09:00:00.000Z'), NOW, TZ)).toBe(2)
  })

  it('is negative backwards and survives the change of daylight saving time', () => {
    expect(calendarDays(NOW, new Date('2026-10-12T10:00:00.000Z'), TZ)).toBe(-1)
    expect(calendarDays(new Date('2026-10-24T10:00:00.000Z'), new Date('2026-10-26T10:00:00.000Z'), TZ)).toBe(2)
  })

  it('works with the runtime time zone when none is given', () => {
    expect(calendarDays(NOW, new Date(NOW.getTime() + 3 * 86_400_000))).toBe(3)
  })
})

describe('effectiveResponseState', () => {
  it('derives the state from the due date and now, so a cached answer does not go stale', () => {
    expect(effectiveResponseState(open('2026-10-17T10:00:00.000Z', { responseState: 'due_soon' }), NOW)).toBe('on_track')
    expect(effectiveResponseState(open('2026-10-15T10:00:00.000Z'), NOW)).toBe('due_soon')
    expect(effectiveResponseState(open('2026-10-15T10:00:01.000Z'), NOW)).toBe('on_track')
    expect(effectiveResponseState(open('2026-10-13T09:59:59.000Z'), NOW)).toBe('overdue')
  })

  it('keeps answered and closed from the api, and closes decided applications', () => {
    expect(effectiveResponseState(open('2026-10-10T10:00:00.000Z', { responseState: 'answered' }), NOW)).toBe('answered')
    expect(effectiveResponseState(open(null, { respondedAt: '2026-10-12T10:00:00.000Z' }), NOW)).toBe('answered')
    expect(effectiveResponseState(open('2026-10-10T10:00:00.000Z', { responseState: 'closed' }), NOW)).toBe('closed')
    expect(effectiveResponseState(open('2026-10-10T10:00:00.000Z', { outcome: 'hired' }), NOW)).toBe('closed')
  })

  it('is unknown without a due date or with an invalid one', () => {
    expect(effectiveResponseState(open(null), NOW)).toBeNull()
    expect(effectiveResponseState(open('not a date'), NOW)).toBeNull()
  })
})

describe('responseCountdown', () => {
  it('says how many days are left while on track', () => {
    expect(responseCountdown(open('2026-10-16T08:00:00.000Z'), NOW, TZ)).toEqual({ state: 'on_track', tone: 'neutral', key: 'response.dueIn', count: 3 })
  })

  it('warns when the deadline is near: tomorrow, then today', () => {
    expect(responseCountdown(open('2026-10-14T20:00:00.000Z'), NOW, TZ)).toEqual({ state: 'due_soon', tone: 'warning', key: 'response.dueIn', count: 1 })
    expect(responseCountdown(open('2026-10-13T20:00:00.000Z'), NOW, TZ)).toEqual({ state: 'due_soon', tone: 'warning', key: 'response.dueToday', count: 0 })
  })

  it('counts the days of delay once the deadline has passed', () => {
    expect(responseCountdown(open('2026-10-13T07:00:00.000Z'), NOW, TZ)).toEqual({ state: 'overdue', tone: 'destructive', key: 'response.overdueToday', count: 0 })
    expect(responseCountdown(open('2026-10-12T21:00:00.000Z'), NOW, TZ)).toEqual({ state: 'overdue', tone: 'destructive', key: 'response.overdue', count: 1 })
    expect(responseCountdown(open('2026-10-11T12:00:00.000Z'), NOW, TZ)).toEqual({ state: 'overdue', tone: 'destructive', key: 'response.overdue', count: 2 })
  })

  it('shows "answered" quietly and nothing for closed or unknown', () => {
    expect(responseCountdown(open(null, { responseState: 'answered' }), NOW, TZ)).toEqual({ state: 'answered', tone: 'quiet', key: 'response.answered', count: 0 })
    expect(responseCountdown(open('2026-10-11T12:00:00.000Z', { outcome: 'not_selected' }), NOW, TZ)).toBeNull()
    expect(responseCountdown(open(null), NOW, TZ)).toBeNull()
  })
})
