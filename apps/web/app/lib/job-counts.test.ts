import { describe, expect, it, vi } from 'vitest'
import { AppError } from './auth-errors'
import type { JobApiRequest } from './job-api'
import { hasAnyJob, loadJobCounts } from './job-counts'

const page = (total: number) => ({ status: 200, body: { success: true, data: [], error: null, meta: { total, page: 1, limit: 1 } } })

describe('loadJobCounts', () => {
  it('asks one tiny page per status and reads the totals', async () => {
    const totals: Record<string, number> = { draft: 3, published: 2, closed: 1 }
    const request = vi.fn<JobApiRequest>(async (url) => page(totals[new URL(url, 'http://x').searchParams.get('status') ?? ''] ?? 0))
    const counts = await loadJobCounts(request)
    expect(counts).toEqual({ draft: 3, published: 2, closed: 1, total: 6 })
    expect(request.mock.calls.map(([url]) => url).sort()).toEqual([
      '/api/v1/jobs?status=closed&page=1&limit=1',
      '/api/v1/jobs?status=draft&page=1&limit=1',
      '/api/v1/jobs?status=published&page=1&limit=1',
    ])
  })

  it('fails as a whole when one status cannot be read (no partial, misleading numbers)', async () => {
    const request = vi.fn<JobApiRequest>(async (url) => (url.includes('closed') ? { status: 403, body: { success: false, data: null, error: { code: 'forbidden', message: 'x' } } } : page(1)))
    await expect(loadJobCounts(request)).rejects.toBeInstanceOf(AppError)
  })

  it('returns a new object every time', async () => {
    const request = vi.fn<JobApiRequest>(async () => page(0))
    const [a, b] = await Promise.all([loadJobCounts(request), loadJobCounts(request)])
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })
})

describe('hasAnyJob', () => {
  it('is true only when at least one job exists', () => {
    expect(hasAnyJob({ draft: 0, published: 0, closed: 0, total: 0 })).toBe(false)
    expect(hasAnyJob({ draft: 0, published: 0, closed: 1, total: 1 })).toBe(true)
  })
})
