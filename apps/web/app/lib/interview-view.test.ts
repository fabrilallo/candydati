import { describe, expect, it } from 'vitest'
import { ApiFailure } from './api-call'
import {
  bookingFailure,
  calendarErrorKey,
  feedAge,
  groupSlotsByDay,
  interviewStatusTone,
  matchSlot,
  proposeErrorKey,
  proposeNotices,
  timeZoneOptions,
  weekdayOptions,
} from './interview-view'

const failure = (status: number, message: string | null, issues: { path: string; message: string }[] = [], code: string | null = null): ApiFailure =>
  new ApiFailure('errors.generic', { status, code, message, issues })

describe('groupSlotsByDay', () => {
  const slots = ['2026-11-16T08:00:00.000Z', '2026-11-16T08:30:00.000Z', '2026-11-17T23:30:00.000Z']

  it('groups the free times by local day of the zone, in order, with the local time', () => {
    const days = groupSlotsByDay(slots, 'Europe/Rome', 'it')
    expect(days.map((day) => day.key)).toEqual(['2026-11-16', '2026-11-18'])
    expect(days[0]!.slots.map((slot) => slot.time)).toEqual(['09:00', '09:30'])
    expect(days[0]!.label).toMatch(/lunedì 16 novembre/i)
    expect(days[1]!.slots).toEqual([{ iso: '2026-11-17T23:30:00.000Z', time: '00:30' }])
  })

  it('moves the day boundary with the zone', () => {
    const days = groupSlotsByDay(slots, 'America/New_York', 'en')
    expect(days.map((day) => day.key)).toEqual(['2026-11-16', '2026-11-17'])
    expect(days[1]!.slots[0]!.time).toBe('18:30')
    expect(days[0]!.label).toMatch(/Monday 16 November/)
  })

  it('skips what is not a date and sorts what is', () => {
    const days = groupSlotsByDay(['nope', '2026-11-16T09:00:00.000Z', '2026-11-16T08:00:00.000Z'], 'UTC', 'en')
    expect(days).toHaveLength(1)
    expect(days[0]!.slots.map((slot) => slot.time)).toEqual(['08:00', '09:00'])
  })
})

describe('matchSlot', () => {
  const slots = ['2026-11-16T08:00:00.000Z']
  it('finds the time from the email link whatever its spelling, and only among the free ones', () => {
    expect(matchSlot('2026-11-16T09:00:00+01:00', slots)).toBe('2026-11-16T08:00:00.000Z')
    expect(matchSlot('2026-11-16T10:00:00.000Z', slots)).toBeNull()
    expect(matchSlot('garbage', slots)).toBeNull()
    expect(matchSlot(undefined, slots)).toBeNull()
    expect(matchSlot(['2026-11-16T08:00:00.000Z'], slots)).toBeNull()
  })
})

describe('bookingFailure', () => {
  it('maps the conflicts of the booking page to what it says', () => {
    expect(bookingFailure(failure(409, 'slot_taken', [], 'conflict'))).toBe('slotTaken')
    expect(bookingFailure(failure(409, 'too_late_to_change'))).toBe('tooLate')
    expect(bookingFailure(failure(409, 'interview_cancelled'))).toBe('cancelled')
    expect(bookingFailure(failure(409, 'interview_changed'))).toBe('changed')
    expect(bookingFailure(failure(404, 'This link is not valid.'))).toBe('invalid')
    expect(bookingFailure(failure(400, null))).toBe('invalid')
    expect(bookingFailure(failure(429, null))).toBe('rateLimited')
    expect(bookingFailure(failure(500, null))).toBe('unavailable')
    expect(bookingFailure(new Error('boom'))).toBe('unavailable')
  })
})

describe('calendarErrorKey', () => {
  it('explains why the calendar link was refused', () => {
    expect(calendarErrorKey(failure(422, 'x', [{ path: 'url', message: 'calendar_unreachable' }]))).toBe('calendar.errors.unreachable')
    expect(calendarErrorKey(failure(422, 'x', [{ path: 'url', message: 'calendar_not_calendar' }]))).toBe('calendar.errors.not_calendar')
    expect(calendarErrorKey(failure(422, 'x', [{ path: 'url', message: 'calendar_too_large' }]))).toBe('calendar.errors.too_large')
    expect(calendarErrorKey(failure(422, 'x', [{ path: 'url', message: 'calendar_not_allowed' }]))).toBe('calendar.errors.not_allowed')
    expect(calendarErrorKey(failure(422, 'x', [{ path: 'url', message: 'Invalid URL' }]))).toBe('calendar.errors.url')
    expect(calendarErrorKey(failure(422, 'x', [{ path: 'workingHours.end', message: 'end_before_start' }]))).toBe('calendar.errors.hours')
    expect(calendarErrorKey(failure(422, 'x', [{ path: 'timeZone', message: 'unknown_time_zone' }]))).toBe('calendar.errors.timeZone')
    expect(calendarErrorKey(failure(0, null))).toBe('errors.generic')
    expect(calendarErrorKey(new Error('x'))).toBe('errors.generic')
  })
})

describe('proposeErrorKey', () => {
  it('says why an interview could not be proposed', () => {
    expect(proposeErrorKey(failure(409, 'conflict'))).toBe('interviews.errors.open')
    expect(proposeErrorKey(failure(422, 'x', [{ path: 'stageId', message: 'no_interviewers' }]))).toBe('interviews.errors.no_interviewers')
    expect(proposeErrorKey(failure(422, 'x', [{ path: 'stageId', message: 'unknown_stage' }]))).toBe('interviews.errors.unknown_stage')
    expect(proposeErrorKey(failure(422, 'x', [{ path: 'applicationId', message: 'application_closed' }]))).toBe('interviews.errors.application_closed')
    expect(proposeErrorKey(new Error('x'))).toBe('errors.generic')
  })
})

describe('proposeNotices', () => {
  it('always says the candidate gets the email, and warns about missing calendars and no free time', () => {
    expect(proposeNotices({ freeSlots: 12, withoutCalendar: [] })).toEqual([{ key: 'interviews.proposed.sent', tone: 'success' }])
    expect(proposeNotices({ freeSlots: 0, withoutCalendar: ['Luca Bianchi', 'Sara'] })).toEqual([
      { key: 'interviews.proposed.sent', tone: 'success' },
      { key: 'interviews.proposed.withoutCalendar', tone: 'warning', params: { names: 'Luca Bianchi, Sara', count: 2 } },
      { key: 'interviews.proposed.noSlots', tone: 'warning' },
    ])
  })
})

describe('feedAge', () => {
  const now = new Date('2026-11-10T12:00:00.000Z')
  it('says how long ago the calendar was read', () => {
    expect(feedAge('2026-11-10T11:59:40.000Z', now)).toEqual({ key: 'calendar.status.justNow', count: 0 })
    expect(feedAge('2026-11-10T11:48:00.000Z', now)).toEqual({ key: 'calendar.status.minutesAgo', count: 12 })
    expect(feedAge('2026-11-10T09:00:00.000Z', now)).toEqual({ key: 'calendar.status.hoursAgo', count: 3 })
    expect(feedAge('2026-11-07T09:00:00.000Z', now)).toEqual({ key: 'calendar.status.daysAgo', count: 3 })
    expect(feedAge(null, now)).toBeNull()
  })
})

describe('weekdayOptions', () => {
  it('lists Monday to Sunday with ISO numbers in the locale', () => {
    const days = weekdayOptions('it')
    expect(days.map((day) => day.day)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(days[0]!.label).toMatch(/^lun/i)
    expect(weekdayOptions('en')[6]!.label).toMatch(/^Sun/)
  })
})

describe('timeZoneOptions', () => {
  it('lists the zones and keeps the chosen one even when the runtime does not', () => {
    const zones = timeZoneOptions('Mars/Olympus')
    expect(zones).toContain('Europe/Rome')
    expect(zones).toContain('Mars/Olympus')
    expect(new Set(zones).size).toBe(zones.length)
    expect(timeZoneOptions('Europe/Rome').filter((zone) => zone === 'Europe/Rome')).toHaveLength(1)
  })
})

describe('interviewStatusTone', () => {
  it('colours the state only', () => {
    expect(interviewStatusTone('booked')).toBe('success')
    expect(interviewStatusTone('proposed')).toBe('warning')
    expect(interviewStatusTone('cancelled')).toBe('secondary')
  })
})
