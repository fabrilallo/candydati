import { describe, expect, it, vi } from 'vitest'
import { ApiFailure } from './api-call'
import type { JobApiRequest } from './job-api'
import {
  answerPublicShortlist,
  createClient,
  getAgencySetting,
  getJobClient,
  listClients,
  listJobShortlists,
  loadPublicShortlist,
  revokeShortlist,
  sendShortlist,
  setAgencySetting,
  setClientArchived,
  setJobClient,
  updateClient,
} from './client-api'

const ok = (data: unknown, status = 200) => ({ status, body: { success: true, data, error: null } })
const fail = (status: number, code: string, issues: unknown[] = []) => ({ status, body: { success: false, data: null, error: { code, message: 'x', issues } } })
const stub = (response: unknown) => vi.fn<JobApiRequest>().mockResolvedValue(response as never)
const AT = '2026-10-13T10:00:00.000Z'
const client = (overrides = {}) => ({ id: 'c1', name: 'Acme', website: null, logoUrl: null, contacts: [{ id: 'k1', name: 'Rita', email: 'rita@acme.it' }], archived: false, jobCount: 2, createdAt: AT, updatedAt: AT, ...overrides })
const shortlist = (overrides = {}) => ({
  id: 's1', jobId: 'j1', clientId: 'c1', clientName: 'Acme', recipientName: 'Rita', recipientEmail: 'rita@acme.it', message: null, status: 'open',
  remindersSent: 0, firstOpenedAt: null, createdAt: AT, expiresAt: AT, revokedAt: null,
  items: [{ id: 'i1', applicationId: 'a1', candidateName: 'Giulia Rossi', shareCv: true, sharedNoteCount: 1, answer: null, answerReason: null, answeredAt: null, candidateNotified: true }],
  ...overrides,
})
const publicView = (overrides = {}) => ({
  agencyName: 'Talenti', clientName: 'Acme', recipientName: 'Rita', jobTitle: 'Backend developer', language: 'it', message: 'Ecco i profili', expiresAt: AT,
  candidates: [{ itemId: 'i1', firstName: 'Giulia', lastName: 'Rossi', hasCv: true, notes: [{ body: 'Ottima', at: AT }], answer: null, answerReason: null, answeredAt: null }],
  ...overrides,
})

describe('agency setting', () => {
  it('reads and saves it', async () => {
    expect(await getAgencySetting(stub(ok({ recruitsForClients: true, agencyAuthorization: null })))).toEqual({ recruitsForClients: true, agencyAuthorization: null })
    const request = stub(ok({ recruitsForClients: true, agencyAuthorization: 'Aut. 123' }))
    await setAgencySetting(request, { recruitsForClients: true, agencyAuthorization: 'Aut. 123' })
    expect(request).toHaveBeenCalledWith('/api/v1/settings/agency', { method: 'PUT', body: { recruitsForClients: true, agencyAuthorization: 'Aut. 123' } })
  })
})

describe('clients', () => {
  it('lists, archived included on request', async () => {
    const request = stub(ok([client()]))
    expect((await listClients(request, true))[0]?.name).toBe('Acme')
    expect(request).toHaveBeenCalledWith('/api/v1/clients?includeArchived=true', undefined)
    const active = stub(ok([]))
    await listClients(active)
    expect(active).toHaveBeenCalledWith('/api/v1/clients', undefined)
  })

  it('creates, replaces and archives', async () => {
    const input = { name: 'Acme', website: null, logoUrl: null, contacts: [] }
    const create = stub(ok(client(), 201))
    await createClient(create, input)
    expect(create).toHaveBeenCalledWith('/api/v1/clients', { method: 'POST', body: input })
    const update = stub(ok(client()))
    await updateClient(update, 'c 1', input)
    expect(update).toHaveBeenCalledWith('/api/v1/clients/c%201', { method: 'PUT', body: input })
    const archive = stub(ok(client({ archived: true })))
    expect((await setClientArchived(archive, 'c1', true)).archived).toBe(true)
    expect(archive).toHaveBeenCalledWith('/api/v1/clients/c1/archived', { method: 'PUT', body: { archived: true } })
  })

  it('keeps the code of a refusal (setting off, duplicate name)', async () => {
    await expect(createClient(stub(fail(409, 'clients_off')), { name: 'x', contacts: [] })).rejects.toMatchObject({ failure: { code: 'clients_off' } })
  })
})

describe('client of a job', () => {
  it('reads and sets it', async () => {
    expect((await getJobClient(stub(ok({ jobId: 'j1', client: null, display: 'named' })), 'j1')).client).toBeNull()
    const request = stub(ok({ jobId: 'j1', client: { id: 'c1', name: 'Acme', archived: false }, display: 'confidential' }))
    await setJobClient(request, 'j1', { clientId: 'c1', display: 'confidential' })
    expect(request).toHaveBeenCalledWith('/api/v1/jobs/j1/client', { method: 'PUT', body: { clientId: 'c1', display: 'confidential' } })
  })
})

describe('shortlists', () => {
  it('lists, sends and revokes', async () => {
    expect((await listJobShortlists(stub(ok([shortlist()])), 'j1'))[0]?.items[0]?.candidateName).toBe('Giulia Rossi')
    const body = { contactId: 'k1', message: 'Ciao', candidates: [{ applicationId: 'a1', shareCv: true, noteIds: ['n1'] }] }
    const send = stub(ok(shortlist(), 201))
    await sendShortlist(send, 'j1', body)
    expect(send).toHaveBeenCalledWith('/api/v1/jobs/j1/shortlists', { method: 'POST', body })
    const revoke = stub(ok(shortlist({ status: 'revoked', revokedAt: AT })))
    expect((await revokeShortlist(revoke, 's1')).status).toBe('revoked')
    expect(revoke).toHaveBeenCalledWith('/api/v1/shortlists/s1/revoke', { method: 'POST', body: {} })
  })

  it('surfaces the issues of a refused shortlist', async () => {
    const error = await sendShortlist(stub(fail(422, 'validation_failed', [{ path: 'candidates.0.shareCv', message: 'no_cv' }])), 'j1', { contactId: 'k', candidates: [] }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiFailure)
    expect((error as ApiFailure).failure.issues).toEqual([{ path: 'candidates.0.shareCv', message: 'no_cv' }])
  })
})

describe('public shortlist', () => {
  it('loads it, or says the link does not work', async () => {
    const good = stub(ok(publicView()))
    expect(await loadPublicShortlist(good, 'tok')).toMatchObject({ kind: 'ok', data: { clientName: 'Acme' } })
    expect(good).toHaveBeenCalledWith('/api/v1/public/shortlists/tok', undefined)
    expect(await loadPublicShortlist(stub(fail(404, 'not_found')), 'tok')).toEqual({ kind: 'invalid' })
    expect(await loadPublicShortlist(vi.fn<JobApiRequest>().mockRejectedValue(new Error('down')), 'tok')).toEqual({ kind: 'unavailable' })
  })

  it('sends an answer and returns the updated candidate', async () => {
    const answered = { ...publicView().candidates[0], answer: 'meet', answerReason: 'Bel profilo', answeredAt: AT }
    const request = stub(ok(answered))
    expect((await answerPublicShortlist(request, 'tok', { itemId: 'i1', answer: 'meet', reason: 'Bel profilo' })).answer).toBe('meet')
    expect(request).toHaveBeenCalledWith('/api/v1/public/shortlists/tok/answers', { method: 'POST', body: { itemId: 'i1', answer: 'meet', reason: 'Bel profilo' } })
  })
})
