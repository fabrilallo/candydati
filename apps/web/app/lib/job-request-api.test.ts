import { describe, expect, it, vi } from 'vitest'
import { ApiFailure } from './api-call'
import type { JobApiRequest } from './job-api'
import { approveJobRequest, convertJobRequest, createJobRequest, getApprovalSetting, getJobRequest, listJobRequests, rejectJobRequest, setApprovalSetting } from './job-request-api'
import { jobRequest } from '../../test/fixtures/job-request-fixtures'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const NOW = '2026-10-13T10:00:00.000Z'
const content = { title: 'Dev', language: 'it', salary: { currency: 'EUR', period: 'year' }, location: {}, process: [], summary: '', responsibilities: [], requirements: { mustHave: [], niceToHave: [] }, technologies: [], benefits: [], growth: '', workLifeBalance: '', culture: '' }
const job = { id: 'j1', slug: 'dev-abc', status: 'draft', content, quality: null, publishIssues: [], createdAt: NOW, updatedAt: NOW, publishedAt: null, closedAt: null }
const stub = (response: unknown) => vi.fn<JobApiRequest>().mockResolvedValue(response as never)

describe('job request api', () => {
  it('lists and reads requests, parsing leniently', async () => {
    const request = stub(ok([jobRequest('r1', { status: 'weird', role: 'nope' })]))
    const [first] = await listJobRequests(request)
    expect(request).toHaveBeenCalledWith('/api/v1/job-requests', undefined)
    expect(first).toMatchObject({ id: 'r1', status: 'submitted', role: null })
    expect((await getJobRequest(stub(ok(jobRequest('r 2'))), 'r 2')).id).toBe('r 2')
  })

  it('creates a request with POST', async () => {
    const request = stub(ok(jobRequest('r1')))
    await createJobRequest(request, { title: 'Dev', reason: 'x', headcount: 1, salaryMin: 1, salaryMax: 2, currency: 'EUR' })
    expect(request).toHaveBeenCalledWith('/api/v1/job-requests', expect.objectContaining({ method: 'POST' }))
  })

  it('approves with an optional note and rejects with a trimmed one', async () => {
    const request = stub(ok(jobRequest('r1')))
    await approveJobRequest(request, 'r1', '  ')
    expect(request).toHaveBeenLastCalledWith('/api/v1/job-requests/r1/approve', { method: 'POST', body: {} })
    await approveJobRequest(request, 'r1', ' ok ')
    expect(request).toHaveBeenLastCalledWith('/api/v1/job-requests/r1/approve', { method: 'POST', body: { note: 'ok' } })
    await rejectJobRequest(request, 'r1', ' no budget ')
    expect(request).toHaveBeenLastCalledWith('/api/v1/job-requests/r1/reject', { method: 'POST', body: { note: 'no budget' } })
  })

  it('converts into a job', async () => {
    const created = await convertJobRequest(stub(ok(job)), 'r1')
    expect(created.id).toBe('j1')
  })

  it('reads and writes the approval setting', async () => {
    expect(await getApprovalSetting(stub(ok({ requireApproval: true })))).toBe(true)
    const request = stub(ok({ requireApproval: false }))
    expect(await setApprovalSetting(request, false)).toBe(false)
    expect(request).toHaveBeenCalledWith('/api/v1/settings/approval', { method: 'PUT', body: { requireApproval: false } })
  })

  it('turns a failure into an ApiFailure', async () => {
    const request = stub({ status: 403, body: { success: false, data: null, error: { code: 'forbidden', message: 'x' } } })
    await expect(approveJobRequest(request, 'r1', '')).rejects.toBeInstanceOf(ApiFailure)
  })
})
