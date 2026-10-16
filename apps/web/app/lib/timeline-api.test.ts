import { describe, expect, it } from 'vitest'
import { ApiFailure } from './api-call'
import type { JobApiRequest } from './job-api'
import { getApplicationTimeline } from './timeline-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data } })

describe('timeline api', () => {
  it('reads the timeline of an application, with the pipeline it is opened from', async () => {
    const urls: string[] = []
    const request: JobApiRequest = async (url) => {
      urls.push(String(url))
      return ok({ items: [{ kind: 'reconfirmation_sent', id: 'x', at: '2026-05-01T09:00:00.000Z', actor: null, fromPreviousSystem: false }] })
    }
    expect((await getApplicationTimeline(request, 'a/1', 'j 1')).items).toHaveLength(1)
    expect(urls).toEqual(['/api/v1/applications/a%2F1/timeline?viaJobId=j%201'])
    await getApplicationTimeline(request, 'a1')
    expect(urls[1]).toBe('/api/v1/applications/a1/timeline')
  })

  it('refuses an answer the api could not have sent', async () => {
    await expect(getApplicationTimeline(async () => ok({ items: [{ kind: 'score', value: 9 }] }), 'a1')).rejects.toBeDefined()
  })

  it('surfaces a refusal', async () => {
    const request: JobApiRequest = async () => ({ status: 404, body: { success: false, error: { code: 'not_found', message: 'x' } } })
    await expect(getApplicationTimeline(request, 'a1')).rejects.toBeInstanceOf(ApiFailure)
  })
})
