import { describe, expect, it, vi } from 'vitest'
import { ApiFailure } from './api-call'
import { feedbackFailure, listApplicationFeedback, loadPublicFeedback, requestFeedback, submitPublicFeedback } from './feedback-api'
import type { JobApiRequest } from './job-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data } })
const fail = (status: number, code: string) => ({ status, body: { success: false, error: { code, message: 'x' } } })
const form = {
  organization: { name: 'Acme' },
  candidate: { firstName: 'Ada', lastName: 'Lovelace' },
  job: { title: 'Backend' },
  stage: { label: null, type: 'technical_interview', note: null },
  questions: [{ id: 'q1', label: 'Cosa?' }],
}

describe('feedback api', () => {
  it('loads the public form with defaults', async () => {
    const request: JobApiRequest = async () => ok(form)
    const load = await loadPublicFeedback(request, 'tok')
    expect(load).toMatchObject({ kind: 'ok', data: { language: 'it', hasCv: false, questions: [{ id: 'q1', hint: null }] } })
  })

  it.each([
    [404, 'not_found', 'invalid'],
    [410, 'expired', 'expired'],
    [409, 'already_used', 'used'],
    [429, 'rate_limited', 'rateLimited'],
    [500, 'boom', 'unavailable'],
  ])('maps %s to %s', async (status, code, expected) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const load = await loadPublicFeedback(async () => fail(status, code), 'tok')
    expect(load).toEqual({ kind: 'failed', failure: expected })
    spy.mockRestore()
  })

  it('never throws on an unreachable api', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const load = await loadPublicFeedback(async () => Promise.reject(new Error('down')), 'tok')
    expect(load).toEqual({ kind: 'failed', failure: 'unavailable' })
    expect(feedbackFailure(new Error('x'))).toBe('unavailable')
    expect(feedbackFailure(new ApiFailure('k', { status: 410, code: null, message: null, issues: [] }))).toBe('expired')
    spy.mockRestore()
  })

  it('posts the submission, the request and reads the list', async () => {
    const calls: { url: string; body: unknown; method?: string }[] = []
    const request: JobApiRequest = async (url, call) => {
      calls.push({ url, body: call?.body, method: call?.method })
      return ok(url.endsWith('/feedback') ? { requests: [], feedback: [] } : {})
    }
    await submitPublicFeedback(request, 'a/b', { answers: { q1: 'x' }, recommendation: 'discuss' })
    await requestFeedback(request, 'app1', { stageId: 's1' })
    expect(await listApplicationFeedback(request, 'app1')).toEqual({ requests: [], feedback: [] })
    expect(calls.map((c) => [c.method ?? 'GET', c.url])).toEqual([
      ['POST', '/api/v1/public/feedback/a%2Fb'],
      ['POST', '/api/v1/applications/app1/feedback/request'],
      ['GET', '/api/v1/applications/app1/feedback'],
    ])
    expect(calls[1]?.body).toEqual({ stageId: 's1' })
  })
})
