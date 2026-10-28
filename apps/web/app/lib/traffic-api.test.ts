import { describe, expect, it, vi } from 'vitest'
import type { JobApiRequest } from './job-api'
import { getJobTraffic } from './traffic-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const stub = (response: unknown) => vi.fn<JobApiRequest>().mockResolvedValue(response as never)
const row = { day: '2026-10-23', origin: 'linkedin', campaign: '', visits: 3, applications: 1 }
const traffic = { jobId: 'j 1', from: '2026-10-22T00:00:00.000Z', to: '2026-10-28T23:59:59.999Z', rows: [row] }

describe('traffic api', () => {
  it('asks for whole UTC days of one job and refuses a malformed answer', async () => {
    const request = stub(ok(traffic))
    expect(await getJobTraffic(request, 'j 1', { from: '2026-10-22', to: '2026-10-28' })).toEqual(traffic)
    expect(request).toHaveBeenCalledWith('/api/v1/jobs/j%201/traffic?from=2026-10-22T00%3A00%3A00.000Z&to=2026-10-28T23%3A59%3A59.999Z', undefined)
    const bad = { ...traffic, rows: [{ ...row, visits: -1 }] }
    await expect(getJobTraffic(stub(ok(bad)), 'j', { from: '2026-10-22', to: '2026-10-28' })).rejects.toMatchObject({ code: 'invalid_response' })
  })
})
