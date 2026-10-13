import { describe, expect, it, vi } from 'vitest'
import { detail } from '~~/test/fixtures/candidate-fixtures'
import { dataExport, processingRecord, retentionOverview } from '~~/test/fixtures/phase5-fixtures'
import { ApiFailure } from './api-call'
import {
  candidateExportUrl,
  correctCandidate,
  createDataExport,
  dataExportUrl,
  eraseApplication,
  eraseCandidate,
  getProcessingRecord,
  getRetentionOverview,
  isEmailConflict,
  listDataExports,
  withdrawConsent,
} from './gdpr-api'
import type { JobApiRequest } from './job-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)
const failing = (status: number, code: string) => ({ status, body: { success: false, data: null, error: { code, message: code } } })

describe('candidate rights api', () => {
  it('builds the same-origin ZIP addresses', () => {
    expect(candidateExportUrl('c 1')).toBe('/api/v1/candidates/c%201/export')
    expect(dataExportUrl('e1')).toBe('/api/v1/exports/e1/download')
  })

  it('corrects the details with only the changed fields', async () => {
    const request = send(ok(detail()))
    const fresh = await correctCandidate(request, 'c1', { email: 'new@example.com' })
    expect(fresh.candidate.id).toBe('c1')
    expect(request.mock.calls[0]).toEqual(['/api/v1/candidates/c1/details', { method: 'PATCH', body: { email: 'new@example.com' } }])
  })

  it('recognises an email conflict', async () => {
    const error = await correctCandidate(send(failing(409, 'conflict')), 'c1', { email: 'x@example.com' }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiFailure)
    expect(isEmailConflict(error)).toBe(true)
    expect(isEmailConflict(new Error('x'))).toBe(false)
    const other = await correctCandidate(send(failing(422, 'validation_failed')), 'c1', {}).catch((caught: unknown) => caught)
    expect(isEmailConflict(other)).toBe(false)
  })

  it('erases a candidate or one application with the confirmed name', async () => {
    const request = send(ok({ erased: true }))
    await eraseCandidate(request, 'c1', 'Giulia Rossi')
    await eraseApplication(request, 'a1', 'Giulia Rossi')
    expect(request.mock.calls).toEqual([
      ['/api/v1/candidates/c1/erase', { method: 'POST', body: { confirmName: 'Giulia Rossi' } }],
      ['/api/v1/applications/a1/erase', { method: 'POST', body: { confirmName: 'Giulia Rossi' } }],
    ])
  })

  it('withdraws a consent: the fresh detail, or the news that the application is gone', async () => {
    const kept = await withdrawConsent(send(ok(detail())), 'a1', 'talent_pool')
    expect(kept).toMatchObject({ erased: false })
    const gone = send(ok({ erased: true }))
    expect(await withdrawConsent(gone, 'a1', 'selection')).toEqual({ erased: true })
    expect(gone.mock.calls[0]).toEqual(['/api/v1/applications/a1/withdraw-consent', { method: 'POST', body: { scope: 'selection' } }])
  })
})

describe('retention and exports api', () => {
  it('reads the retention overview as the api sends it', async () => {
    const overview = await getRetentionOverview(send(ok(retentionOverview())))
    expect(overview.upcoming.map((item) => item.candidateName)).toEqual(['Marta Verdi', 'Luca Neri'])
    expect(overview.lastRuns[0]).toMatchObject({ id: 'r1', warned: 2, erased: 1 })
    await expect(getRetentionOverview(send(ok({ upcoming: [{ applicationId: 'a1' }], lastRuns: [] })))).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('lists, creates and reads the exports', async () => {
    expect((await listDataExports(send(ok([dataExport('e1', { sizeBytes: null, completedAt: null })]))))[0]?.sizeBytes).toBeNull()
    const create = send(ok({ id: 'e2', status: 'pending' }))
    expect(await createDataExport(create)).toEqual({ id: 'e2', status: 'pending' })
    expect(create.mock.calls[0]).toEqual(['/api/v1/exports', { method: 'POST', body: {} }])
  })

  it('reads the processing record: the configured providers, the model only when set', async () => {
    const record = await getProcessingRecord(send(ok(processingRecord())))
    expect(record.providers).toEqual({ storage: 's3', email: 'smtp', model: 'mistral/mistral-small' })
    const bare = await getProcessingRecord(send(ok(processingRecord({ retentionDays: null, providers: { storage: 'local', email: 'resend', model: null } }))))
    expect(bare.retentionDays).toBeNull()
    expect(bare.providers.model).toBeNull()
    await expect(getProcessingRecord(send(ok({ organization: { name: 'Acme' }, providers: [] })))).rejects.toMatchObject({ code: 'invalid_response' })
  })
})
