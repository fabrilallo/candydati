import { describe, expect, it, vi } from 'vitest'
import { batch, importDetail, importItem, publicConsent } from '~~/test/fixtures/phase8-fixtures'
import { ApiFailure } from './api-call'
import { answerConsent, commitImport, consentAnswer, consentFailure, getImport, ITEMS_PAGE, listImports, loadConsent, saveItems, saveMapping, undoImport } from './import-api'
import type { JobApiRequest } from './job-api'
import { importBatchSchema, importDetailSchema, undoResultSchema } from './phase8-contract'

const ok = (data: unknown, meta?: unknown) => ({ status: 200, body: { success: true, data, error: null, ...(meta ? { meta } : {}) } })
const failing = (status: number, code: string) => ({ status, body: { success: false, data: null, error: { code, message: code } } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)

describe('import batches api', () => {
  it('lists batches, reading the author and defaulting missing counts', async () => {
    const request = send(ok([batch(), batch({ id: 'b2', createdBy: 'u2', createdByName: 'Marco', counts: {}, status: 'weird' })]))
    const list = await listImports(request)
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/imports')
    expect(list[0]?.author).toEqual({ id: 'u1', name: 'Elena Conti' })
    expect(list[1]?.author).toEqual({ id: 'u2', name: 'Marco' })
    expect(importBatchSchema.parse(batch({ createdBy: 'u3' })).author).toEqual({ id: 'u3', name: null })
    expect(list[1]?.counts.imported).toBe(0)
    expect(list[1]?.status).toBe('failed')
  })

  it('validates columnSamples, up to three values per header, empty when absent', () => {
    expect(importBatchSchema.parse(batch({ columnSamples: { Nome: ['a', 'b', 'c'] } })).columnSamples).toEqual({ Nome: ['a', 'b', 'c'] })
    expect(importBatchSchema.parse(batch()).columnSamples).toEqual({})
    expect(() => importBatchSchema.parse(batch({ columnSamples: { Nome: ['a', 'b', 'c', 'd'] } }))).toThrow()
    expect(() => importBatchSchema.parse(batch({ columnSamples: { Nome: [1] } }))).toThrow()
  })

  it('reads a batch without author as null', () => {
    expect(importBatchSchema.parse({ id: 'b', status: 'ready', createdAt: '2026-10-10T09:00:00.000Z' }).author).toBeNull()
  })

  it('reads every page of preview items', async () => {
    const request = vi.fn<JobApiRequest>(async (url) =>
      url.includes('page=1') ? ok(importDetail(), { total: ITEMS_PAGE + 1, page: 1, limit: ITEMS_PAGE }) : ok(importDetail({ items: [importItem('i9')] }), { total: ITEMS_PAGE + 1, page: 2, limit: ITEMS_PAGE }),
    )
    const detail = await getImport(request, 'b1')
    expect(request.mock.calls.map((call) => call[0])).toEqual([`/api/v1/imports/b1?page=1&limit=${ITEMS_PAGE}`, `/api/v1/imports/b1?page=2&limit=${ITEMS_PAGE}`])
    expect(detail.items.map((item) => item.id)).toEqual(['i1', 'i2', 'i3', 'i9'])
  })

  it('reads the item with the proposal spread on it and the page info inside the data', async () => {
    const spread = {
      id: 'i7',
      included: false,
      status: 'pending',
      confidence: 'medium',
      basis: 'single',
      candidate: { firstName: 'Luca', lastName: 'Bianchi', email: null, phone: '+39 2', linkedinUrl: null, tags: [], note: null },
      cv: null,
      headline: null,
      sources: { rows: [1], files: [] },
      existing: null,
      conflicts: [],
      flags: ['no_email', 'no_cv'],
    }
    const request = vi.fn<JobApiRequest>(async (url) => ok({ batch: batch({ status: 'ready' }), items: url.includes('page=1') ? [spread] : [importItem('i8')], total: ITEMS_PAGE + 1, page: 1, limit: ITEMS_PAGE }))
    const detail = await getImport(request, 'b1')
    expect(request).toHaveBeenCalledTimes(2)
    expect(detail.items[0]).toMatchObject({ id: 'i7', included: false, firstName: 'Luca', email: null, sources: [{ kind: 'row', row: 1 }], flags: ['no_email', 'no_cv'] })
  })

  it('reads a single page without meta', async () => {
    const detail = await getImport(send(ok(importDetail())), 'b1')
    expect(detail.items).toHaveLength(3)
  })

  it('saves mapping and items, commits and undoes', async () => {
    const request = vi.fn<JobApiRequest>(async (url) => (url.endsWith('/undo') ? ok({ removed: 8, kept: 2 }) : url.endsWith('/items') ? ok(null) : ok({ id: 'b1', status: 'analyzing' })))
    expect(await saveMapping(request, 'b1', { firstName: null, lastName: null, fullName: 'Nome', email: 'Email', phone: null, linkedin: null, notes: null, tags: null, file: null })).toEqual({ id: 'b1', status: 'analyzing' })
    await saveItems(request, 'b1', { items: [{ itemId: 'a', included: true }] })
    expect(await commitImport(request, 'b1')).toEqual({ id: 'b1', status: 'analyzing' })
    expect(await undoImport(request, 'b1')).toEqual({ removed: 8, kept: 2 })
    expect(request.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ['/api/v1/imports/b1/mapping', 'PUT'],
      ['/api/v1/imports/b1/items', 'PUT'],
      ['/api/v1/imports/b1/commit', 'POST'],
      ['/api/v1/imports/b1/undo', 'POST'],
    ])
  })
})

describe('lenient wire shapes', () => {
  it('reads the domain item with its nested proposal', () => {
    const detail = importDetailSchema.parse({
      ...batch({ status: 'ready' }),
      items: [
        {
          id: 'i1',
          included: true,
          status: 'pending',
          proposal: {
            confidence: 'medium',
            basis: 'name',
            candidate: { firstName: 'Anna', lastName: 'Rossi', email: null, phone: '+39 1', linkedinUrl: null, tags: [], note: null },
            cv: { fileName: 'anna.pdf', key: 'k' },
            headline: 'Data engineer',
            sources: { rows: [3], files: ['cv/anna.pdf'] },
            existing: { id: 'c1', firstName: 'Anna', lastName: 'Rossi', phone: null, linkedinUrl: null },
            conflicts: [{ field: 'phone', kind: 'existing', kept: '+39 0', other: '+39 1' }],
            flags: ['no_email', 'existing_candidate'],
          },
        },
      ],
    })
    expect(detail.batch.id).toBe('b1')
    expect(detail.items[0]).toMatchObject({
      id: 'i1',
      confidence: 'medium',
      firstName: 'Anna',
      email: null,
      sources: [{ kind: 'file', name: 'cv/anna.pdf' }, { kind: 'row', row: 3 }],
      existing: { id: 'c1', name: 'Anna Rossi' },
      flags: ['no_email', 'existing_candidate'],
    })
  })

  it('reads the mapping, the job title and the undo counts in either form', () => {
    const parsed = importBatchSchema.parse(batch({ job: undefined, jobTitle: 'Data Engineer', mapping: { email: 'Email', bogus: 'x' } }))
    expect(parsed.job).toEqual({ id: 'j1', title: 'Data Engineer' })
    expect(parsed.mapping?.email).toBe('Email')
    expect(parsed.mapping?.fullName).toBeNull()
    expect(undoResultSchema.parse({ counts: { erased: 4, skippedReconfirmed: 1 } })).toEqual({ removed: 4, kept: 1 })
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
    const request = send(ok({ status: 'given' }))
    await answerConsent(request, 't', { decline: true })
    expect(request.mock.calls[0]).toEqual(['/api/v1/public/consent/t', { method: 'POST', body: { decline: true } }])
  })
})
