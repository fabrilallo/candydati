import { describe, expect, it, vi } from 'vitest'
import type { JobApiRequest } from './job-api'
import { listTrackedLinks, removeTrackedLink, saveTrackedLink } from './tracked-link-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const stub = (response: unknown) => vi.fn<JobApiRequest>().mockResolvedValue(response as never)
const link = { id: 'tl 1', jobId: 'j 1', source: 'linkedin', campaign: '', createdAt: '2026-10-01T10:00:00.000Z' }

describe('tracked link api', () => {
  it('lists the links of a job and refuses a malformed answer', async () => {
    const request = stub(ok([link]))
    expect(await listTrackedLinks(request, 'j 1')).toEqual([link])
    expect(request).toHaveBeenCalledWith('/api/v1/jobs/j%201/tracked-links', undefined)
    await expect(listTrackedLinks(stub(ok([{ ...link, createdAt: 'yesterday' }])), 'j')).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('saves with POST and removes with DELETE', async () => {
    const request = stub(ok({ link, created: true }))
    expect(await saveTrackedLink(request, 'j 1', { source: 'linkedin', campaign: '' })).toEqual({ link, created: true })
    expect(request).toHaveBeenCalledWith('/api/v1/jobs/j%201/tracked-links', expect.objectContaining({ method: 'POST', body: { source: 'linkedin', campaign: '' } }))
    const remove = stub(ok({ removed: true }))
    await removeTrackedLink(remove, 'j 1', 'tl 1')
    expect(remove).toHaveBeenCalledWith('/api/v1/jobs/j%201/tracked-links/tl%201', expect.objectContaining({ method: 'DELETE' }))
  })
})
