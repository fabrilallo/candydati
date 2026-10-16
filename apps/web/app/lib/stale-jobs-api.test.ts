import { describe, expect, it, vi } from 'vitest'
import type { StaleJobDto } from '@candydati/domain'
import { STALE_JOBS_PATH } from './api-paths'
import type { JobApiRequest } from './job-api'
import { listStaleJobs, staleDaysById } from './stale-jobs-api'

const job = (id: string, daysIdle = 120): StaleJobDto => ({
  job: {
    id,
    slug: `annuncio-${id}`,
    status: 'published',
    title: `Annuncio ${id}`,
    role: 'backend_developer',
    publishable: true,
    publishIssueCount: 0,
    salary: { currency: 'EUR', period: 'year' },
    workMode: null,
    qualityTotal: null,
    belowThreshold: false,
    updatedAt: '2026-06-15T10:00:00.000Z',
    publishedAt: '2026-06-01T10:00:00.000Z',
  },
  lastActivityAt: '2026-06-15T10:00:00.000Z',
  daysIdle,
})
const ok = (data: unknown) => ({ success: true, data, error: null })
const send = (body: unknown, status = 200) => vi.fn<JobApiRequest>(async () => ({ status, body }))

describe('stale jobs api', () => {
  it('lists the stale ads from the stale endpoint', async () => {
    const request = send(ok([job('j1'), job('j2', 95)]))
    const jobs = await listStaleJobs(request)
    expect(jobs.map((item) => item.job.id)).toEqual(['j1', 'j2'])
    expect(jobs[1]?.daysIdle).toBe(95)
    expect(request.mock.calls[0]?.[0]).toBe(STALE_JOBS_PATH)
    expect(STALE_JOBS_PATH).toBe('/api/v1/jobs/stale')
  })

  it('refuses a payload that is not a list', async () => {
    await expect(listStaleJobs(send(ok('nope')))).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('turns a refused call into a failure with a translation key', async () => {
    const request = send({ success: false, data: null, error: { code: 'forbidden', message: 'no' } }, 403)
    await expect(listStaleJobs(request)).rejects.toMatchObject({ key: 'errors.forbidden' })
  })

  it('gives the idle days of the stale ads by id', () => {
    const jobs = [job('j1', 120), job('j2', 91)]
    expect(staleDaysById(jobs).get('j2')).toBe(91)
    expect(staleDaysById(jobs).get('j3')).toBeUndefined()
  })
})
