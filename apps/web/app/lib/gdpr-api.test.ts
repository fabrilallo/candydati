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
  it('reads the retention overview, with the name in any of the contract spellings', async () => {
    const raw = {
      upcoming: [
        { applicationId: 'a1', candidateId: 'c1', jobTitle: 'Backend', retentionExpiresAt: '2026-10-25T10:00:00.000Z', candidate: { id: 'c1', firstName: 'Marta', lastName: 'Verdi' } },
        { applicationId: 'a2', candidate: { id: 'c2', firstName: 'Luca', lastName: 'Neri' }, jobTitle: 'Design', retentionExpiresAt: '2026-10-26T10:00:00.000Z' },
        { applicationId: 'a3', candidateId: 'c3', firstName: 'Anna', lastName: 'Bianchi', jobTitle: 'Ops', retentionExpiresAt: '2026-10-27T10:00:00.000Z' },
        { applicationId: 'a4', candidateId: 'c4', jobTitle: 'Ops', retentionExpiresAt: '2026-10-27T10:00:00.000Z' },
        ...retentionOverview().upcoming,
      ],
      lastRuns: [{ id: 'r1', startedAt: '2026-10-13T01:00:00.000Z', warned: 1, erased: 0 }],
    }
    const overview = await getRetentionOverview(send(ok(raw)))
    expect(overview.upcoming.map((item) => item.candidateName)).toEqual(['Marta Verdi', 'Luca Neri', 'Anna Bianchi', null, 'Marta Verdi', 'Luca Neri'])
    expect(overview.upcoming[1]?.candidateId).toBe('c2')
    expect(overview.lastRuns[0]?.finishedAt).toBeNull()
  })

  it('lists, creates and reads the exports', async () => {
    expect((await listDataExports(send(ok([dataExport('e1', { sizeBytes: undefined as never, completedAt: undefined as never })]))))[0]?.sizeBytes).toBeNull()
    const create = send(ok({ id: 'e2', status: 'pending' }))
    expect(await createDataExport(create)).toEqual({ id: 'e2', status: 'pending' })
    expect(create.mock.calls[0]).toEqual(['/api/v1/exports', { method: 'POST', body: {} }])
  })

  it('reads the processing record, providers as a list or as a record', async () => {
    expect((await getProcessingRecord(send(ok(processingRecord())))).providers).toHaveLength(2)
    const asRecord = await getProcessingRecord(send(ok({ organization: { name: 'Acme' }, providers: { hosting: 'Hetzner', email: null, model: 'mistral/small' } })))
    expect(asRecord.providers).toEqual([
      { category: 'hosting', name: 'Hetzner', detail: null },
      { category: 'model', name: 'mistral/small', detail: null },
    ])
    expect(asRecord.retentionDays).toBeNull()
    const withKind = await getProcessingRecord(send(ok({ organization: { name: 'Acme' }, providers: [{ kind: 'storage', name: 'MinIO' }] })))
    expect(withKind.providers).toEqual([{ category: 'storage', name: 'MinIO', detail: null }])
  })
})
