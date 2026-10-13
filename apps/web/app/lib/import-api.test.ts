import { importBatchSchema, undoImportSchema } from '@tt/domain'
import { describe, expect, it, vi } from 'vitest'
import { batch, importDetail, importItem, publicConsent } from '~~/test/fixtures/phase8-fixtures'
import { ApiFailure } from './api-call'
import { answerConsent, commitImport, consentAnswer, consentFailure, getImport, ITEMS_PAGE, listImports, loadConsent, saveItems, saveMapping, undoImport } from './import-api'
import type { JobApiRequest } from './job-api'

const ok = (data: unknown, meta?: unknown) => ({ status: 200, body: { success: true, data, error: null, ...(meta ? { meta } : {}) } })
const failing = (status: number, code: string) => ({ status, body: { success: false, data: null, error: { code, message: code } } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)

describe('import batches api', () => {
  it('lists batches with their author and job as the api sends them', async () => {
    const request = send(ok([batch(), batch({ id: 'b2', createdBy: { id: 'u2', name: 'Marco' }, job: null, status: 'failed' })]))
    const list = await listImports(request)
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/imports')
    expect(list[0]?.createdBy).toEqual({ id: 'u1', name: 'Elena Conti' })
    expect(list[1]).toMatchObject({ createdBy: { id: 'u2', name: 'Marco' }, job: null, status: 'failed' })
  })

  it('refuses a batch with an unknown status or without its counts', async () => {
    await expect(listImports(send(ok([batch({ status: 'weird' })])))).rejects.toMatchObject({ code: 'invalid_response' })
    await expect(listImports(send(ok([batch({ counts: {} })])))).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('validates columnSamples, up to three values per header, absent outside the preview', () => {
    expect(importBatchSchema.parse(batch({ columnSamples: { Nome: ['a', 'b', 'c'] } })).columnSamples).toEqual({ Nome: ['a', 'b', 'c'] })
    expect(importBatchSchema.parse(batch()).columnSamples).toBeUndefined()
    expect(() => importBatchSchema.parse(batch({ columnSamples: { Nome: ['a', 'b', 'c', 'd'] } }))).toThrow()
    expect(() => importBatchSchema.parse(batch({ columnSamples: { Nome: [1] } }))).toThrow()
  })

  it('reads every page of preview items', async () => {
    const request = vi.fn<JobApiRequest>(async (url) =>
      url.includes('page=1') ? ok(importDetail({ total: ITEMS_PAGE + 1 })) : ok(importDetail({ items: [importItem('i9')], total: ITEMS_PAGE + 1, page: 2 })),
    )
    const detail = await getImport(request, 'b1')
    expect(request.mock.calls.map((call) => call[0])).toEqual([`/api/v1/imports/b1?page=1&limit=${ITEMS_PAGE}`, `/api/v1/imports/b1?page=2&limit=${ITEMS_PAGE}`])
    expect(detail.items.map((item) => item.id)).toEqual(['i1', 'i2', 'i3', 'i9'])
  })

  it('flattens the item: the proposal candidate, the sources as files then rows, the existing candidate by name', async () => {
    const detail = await getImport(send(ok(importDetail())), 'b1')
    expect(detail.items).toHaveLength(3)
    expect(detail.items[0]).toMatchObject({ id: 'i1', included: true, firstName: 'Anna', email: 'i1@example.com', sources: [{ kind: 'file', name: 'cv/i1.pdf' }, { kind: 'row', row: 0 }] })
    expect(detail.items[1]).toMatchObject({ existing: { id: 'c9', name: 'Luca Bianchi' }, flags: ['existing_candidate'] })
    expect(detail.items[2]).toMatchObject({ email: null, flags: ['no_email'] })
  })

  it('refuses an item the api could not have sent', async () => {
    const broken = importDetail({ items: [{ ...importItem('i1'), candidate: undefined }] })
    await expect(getImport(send(ok(broken)), 'b1')).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('saves mapping and items, commits and undoes', async () => {
    const request = vi.fn<JobApiRequest>(async (url) =>
      url.endsWith('/undo') ? ok({ batch: batch({ status: 'undone' }), erased: 8, skippedReconfirmed: 2, failed: 0 }) : url.endsWith('/commit') ? ok(batch({ status: 'importing' })) : ok(importDetail()),
    )
    expect((await saveMapping(request, 'b1', { firstName: null, lastName: null, fullName: 'Nome', email: 'Email', phone: null, linkedin: null, notes: null, tags: null, file: null })).id).toBe('b1')
    await saveItems(request, 'b1', { items: [{ itemId: 'a', included: true }] })
    expect((await commitImport(request, 'b1')).status).toBe('importing')
    expect(await undoImport(request, 'b1')).toMatchObject({ erased: 8, skippedReconfirmed: 2 })
    expect(request.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ['/api/v1/imports/b1/mapping', 'PUT'],
      ['/api/v1/imports/b1/items', 'PUT'],
      ['/api/v1/imports/b1/commit', 'POST'],
      ['/api/v1/imports/b1/undo', 'POST'],
    ])
  })

  it('reads the undo answer: the batch and what the undo did', () => {
    expect(undoImportSchema.parse({ batch: batch(), erased: 4, skippedReconfirmed: 1, failed: 0 })).toMatchObject({ erased: 4, skippedReconfirmed: 1 })
    expect(undoImportSchema.safeParse({ counts: { erased: 4 } }).success).toBe(false)
  })
})

describe('public consent', () => {
  it('loads the request', async () => {
    const request = send(ok(publicConsent()))
    const result = await loadConsent(request, 'tok/1')
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/public/consent/tok%2F1')
    expect(result.kind === 'ok' && result.data.organization.name).toBe('Acme')
  })

  it('tells expired, used, invalid, rate limited and unavailable apart', async () => {
    const reason = async (response: { status: number; body: unknown }) => {
      const result = await loadConsent(send(response), 't')
      return result.kind === 'failed' ? result.failure : null
    }
    expect(await reason(failing(410, 'gone'))).toBe('expired')
    expect(await reason(failing(409, 'conflict'))).toBe('used')
    expect(await reason(failing(404, 'not_found'))).toBe('invalid')
    expect(await reason(failing(429, 'rate_limited'))).toBe('rateLimited')
    expect(await reason(failing(500, 'internal'))).toBe('unavailable')
    expect(consentFailure(new Error('x'))).toBe('unavailable')
    expect(consentFailure(new ApiFailure('x', { status: 400, code: 'expired', message: null, issues: [] }))).toBe('expired')
  })

  it('answers with the scopes or the decline', async () => {
    expect(consentAnswer('confirm', false)).toEqual({ scopes: ['selection'] })
    expect(consentAnswer('confirm', true)).toEqual({ scopes: ['selection', 'talent_pool'] })
    expect(consentAnswer('decline', true)).toEqual({ decline: true })
    const request = send(ok({ status: 'declined' }))
    await answerConsent(request, 't', { decline: true })
    expect(request.mock.calls[0]).toEqual(['/api/v1/public/consent/t', { method: 'POST', body: { decline: true } }])
  })
})
