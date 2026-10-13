import { describe, expect, it, vi } from 'vitest'
import { STALE_JOBS_PATH } from './phase9-contract'
import type { JobApiRequest } from './job-api'
import { listStaleJobs, staleDaysById, staleIdSet } from './stale-jobs-api'

const job = (id: string, daysSinceActivity = 120) => ({
  id,
  title: `Annuncio ${id}`,
  publishedAt: '2026-06-01T10:00:00.000Z',
  lastActivityAt: '2026-06-15T10:00:00.000Z',
  daysSinceActivity,
  openApplications: 2,
})
const ok = (data: unknown) => ({ success: true, data, error: null })
const send = (body: unknown, status = 200) => vi.fn<JobApiRequest>(async () => ({ status, body }))

describe('stale jobs api', () => {
  it('lists the stale ads from the stale endpoint', async () => {
    const request = send(ok([job('j1'), job('j2', 95)]))
    const jobs = await listStaleJobs(request)
    expect(jobs.map((item) => item.id)).toEqual(['j1', 'j2'])
    expect(jobs[1]?.daysSinceActivity).toBe(95)
    expect(request.mock.calls[0]?.[0]).toBe(STALE_JOBS_PATH)
    expect(STALE_JOBS_PATH).toBe('/api/v1/jobs/stale')
  })

  it('defaults the optional fields when the api omits them', async () => {
    const [item] = await listStaleJobs(send(ok([{ id: 'j1', title: 'Backend', lastActivityAt: '2026-06-15T10:00:00.000Z', daysSinceActivity: 100 }])))
    expect(item?.publishedAt).toBeNull()
    expect(item?.openApplications).toBe(0)
  })

  it('refuses a payload that is not a list', async () => {
    await expect(listStaleJobs(send(ok('nope')))).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('turns a refused call into a failure with a translation key', async () => {
    const request = send({ success: false, data: null, error: { code: 'forbidden', message: 'no' } }, 403)
    await expect(listStaleJobs(request)).rejects.toMatchObject({ key: 'errors.forbidden' })
  })

  it('gives the ids of the stale ads as a set, and their idle days by id', () => {
    const jobs = [job('j1', 120), job('j2', 91)]
    expect(staleIdSet(jobs)).toEqual(new Set(['j1', 'j2']))
    expect(staleIdSet([])).toEqual(new Set())
    expect(staleDaysById(jobs).get('j2')).toBe(91)
    expect(staleDaysById(jobs).get('j3')).toBeUndefined()
  })
})
