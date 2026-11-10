import { describe, expect, it, vi } from 'vitest'
import { ApiFailure, type FailureInfo } from './api-call'
import {
  bookInterviewSlot,
  cancelApplicationInterview,
  cancelInterviewAsCandidate,
  disconnectCalendarFeed,
  getMyCalendarFeed,
  listInterviews,
  loadPublicInterview,
  proposeInterview,
  saveCalendarFeed,
  updateCalendarHours,
} from './interview-api'
import type { ApiCall, JobApiRequest } from './job-api'
import { calendarFeed, interviewView, publicInterview, workingHours } from '~~/test/fixtures/interview-fixtures'

const ok = (data: unknown, status = 200) => ({ status, body: { success: true, data } })
const hours = workingHours
const feed = calendarFeed()
const interview = interviewView()
const invitation = publicInterview({ language: 'it', slots: ['2026-11-16T08:00:00.000Z'] })

const recorder = (response: { status: number; body: unknown }) => {
  const calls: { url: string; call: ApiCall | undefined }[] = []
  const request: JobApiRequest = async (url, call) => {
    calls.push({ url, call })
    return response
  }
  return { calls, request }
}

describe('calendar feed api', () => {
  it('reads, saves, changes the hours of and disconnects the person’s own calendar', async () => {
    const r = recorder(ok(feed))
    expect(await getMyCalendarFeed(r.request)).toEqual(feed)
    await saveCalendarFeed(r.request, { url: 'https://calendar.google.com/x.ics', timeZone: 'Europe/Rome', workingHours: hours })
    await updateCalendarHours(r.request, { timeZone: 'Europe/Rome', workingHours: hours })
    await disconnectCalendarFeed(r.request)
    expect(r.calls.map(({ url, call }) => [url, call?.method ?? 'GET'])).toEqual([
      ['/api/v1/me/calendar-feed', 'GET'], ['/api/v1/me/calendar-feed', 'PUT'], ['/api/v1/me/calendar-feed', 'PATCH'], ['/api/v1/me/calendar-feed', 'DELETE'],
    ])
    expect(r.calls[1]!.call?.body).toEqual({ url: 'https://calendar.google.com/x.ics', timeZone: 'Europe/Rome', workingHours: hours })
  })

  it('refuses an address that is not https before sending it', async () => {
    const r = recorder(ok(feed))
    await expect(saveCalendarFeed(r.request, { url: 'http://example.com/cal.ics', timeZone: 'Europe/Rome', workingHours: hours })).rejects.toBeInstanceOf(ApiFailure)
    await expect(updateCalendarHours(r.request, { timeZone: 'Europe/Rome', workingHours: { ...hours, end: '08:00' } })).rejects.toMatchObject({ failure: { issues: [expect.objectContaining({ path: 'workingHours.end' })] } })
    expect(r.calls).toEqual([])
  })
})

describe('application interviews api', () => {
  it('lists, proposes and cancels', async () => {
    const r = recorder(ok([interview]))
    expect(await listInterviews(r.request, 'a1')).toHaveLength(1)
    const p = recorder(ok({ interview, freeSlots: 3, withoutCalendar: ['Luca Bianchi'] }, 201))
    expect(await proposeInterview(p.request, 'a1', { stageId: 'stage-0', mode: 'video', location: '' })).toMatchObject({ freeSlots: 3, withoutCalendar: ['Luca Bianchi'] })
    expect(p.calls[0]).toEqual({ url: '/api/v1/applications/a1/interviews', call: { method: 'POST', body: { stageId: 'stage-0', mode: 'video' } } })
    const c = recorder(ok({ ...interview, status: 'cancelled' }))
    expect((await cancelApplicationInterview(c.request, 'i1')).status).toBe('cancelled')
    expect(c.calls[0]!.url).toBe('/api/v1/interviews/i1/cancel')
  })
})

describe('public interview api', () => {
  it('loads the invitation and never throws', async () => {
    expect(await loadPublicInterview(recorder(ok(invitation)).request, 'tok')).toMatchObject({ kind: 'ok', data: { firstName: 'Giulia', slots: ['2026-11-16T08:00:00.000Z'] } })
    const missing = { status: 404, body: { success: false, error: { code: 'not_found', message: 'This link is not valid.' } } }
    expect(await loadPublicInterview(recorder(missing).request, 'tok')).toEqual({ kind: 'failed', failure: 'invalid' })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await loadPublicInterview(recorder(ok({ ...invitation, slots: 'x' })).request, 'tok')).toEqual({ kind: 'failed', failure: 'unavailable' })
    spy.mockRestore()
  })

  it('books a time and cancels with the token', async () => {
    const r = recorder(ok({ status: 'booked', startsAt: '2026-11-16T08:00:00.000Z', endsAt: '2026-11-16T08:45:00.000Z', token: 'new-token-1234567' }))
    expect((await bookInterviewSlot(r.request, 'tok', '2026-11-16T08:00:00.000Z')).token).toBe('new-token-1234567')
    expect(r.calls[0]).toEqual({ url: '/api/v1/public/interviews/tok/book', call: { method: 'POST', body: { slot: '2026-11-16T08:00:00.000Z' } } })
    const c = recorder(ok({ status: 'cancelled' }))
    await cancelInterviewAsCandidate(c.request, 'tok')
    expect(c.calls[0]).toEqual({ url: '/api/v1/public/interviews/tok/cancel', call: { method: 'POST', body: {} } })
  })

  it('keeps the conflict message for the page', async () => {
    const taken = { status: 409, body: { success: false, error: { code: 'conflict', message: 'slot_taken' } } }
    const error = await bookInterviewSlot(recorder(taken).request, 'tok', '2026-11-16T08:00:00.000Z').catch((cause: unknown) => cause)
    expect((error as { failure: FailureInfo }).failure).toMatchObject({ status: 409, message: 'slot_taken' })
  })
})
