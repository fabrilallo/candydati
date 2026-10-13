import { describe, expect, it, vi } from 'vitest'
import { card, detail, note, notice, pipeline, summary } from '~~/test/fixtures/candidate-fixtures'
import {
  addNote,
  candidatesUrl,
  cvUrl,
  decideApplication,
  candidateUrl,
  getCandidate,
  getPipeline,
  listCandidates,
  moveApplication,
  updateCandidateTags,
} from './candidate-api'
import type { JobApiRequest } from './job-api'
import { getActivePrivacyNotice, getPrivacyTemplate, listPrivacyVersions, publishPrivacyNotice } from './privacy-api'

const ok = (data: unknown, meta?: unknown) => ({ status: 200, body: { success: true, data, error: null, ...(meta ? { meta } : {}) } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)

describe('pipeline calls', () => {
  it('loads the pipeline of a job and validates it', async () => {
    const request = send(ok(pipeline()))
    const result = await getPipeline(request, 'j 1')
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/jobs/j%201/pipeline')
    expect(result.stages.map((stage) => stage.id)).toEqual(['received', 'stage-0', 'stage-1'])
  })

  it('moves and decides an application', async () => {
    const move = send(ok(card('a1', 'stage-0')))
    expect((await moveApplication(move, 'a1', 'stage-0')).stageId).toBe('stage-0')
    expect(move.mock.calls[0]).toEqual(['/api/v1/applications/a1/move', { method: 'POST', body: { stageId: 'stage-0' } }])
    const decide = send(ok(card('a1', 'stage-0', { outcome: 'hired', closedAt: '2026-10-14T10:00:00.000Z' })))
    expect((await decideApplication(decide, 'a1', 'hired')).outcome).toBe('hired')
    expect(decide.mock.calls[0]).toEqual(['/api/v1/applications/a1/decide', { method: 'POST', body: { outcome: 'hired' } }])
  })

  it('refuses a card with an unknown outcome', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(moveApplication(send(ok({ ...card('a1'), outcome: 'ghosted' })), 'a1', 'x')).rejects.toMatchObject({ code: 'invalid_response' })
    spy.mockRestore()
  })
})

describe('candidate calls', () => {
  it('builds the search url with only the filters that are set', () => {
    expect(candidatesUrl({ query: '', tag: null, talentPool: false, page: 1 })).toBe('/api/v1/candidates?page=1&limit=20')
    expect(candidatesUrl({ query: ' giulia rossi ', tag: 'go', talentPool: true, page: 3, limit: 5 })).toBe('/api/v1/candidates?query=giulia+rossi&tag=go&talentPool=true&page=3&limit=5')
  })

  it('lists candidates with the page meta and rejects a list without it', async () => {
    const page = await listCandidates(send(ok([summary('s1')], { total: 1, page: 1, limit: 20 })), { query: '', tag: null, talentPool: false, page: 1 })
    expect(page.candidates[0]?.email).toBe('s1@example.com')
    expect(page.meta.total).toBe(1)
    await expect(listCandidates(send(ok([])), { query: '', tag: null, talentPool: false, page: 1 })).rejects.toMatchObject({ key: 'errors.generic' })
  })

  it('reads a profile with its extraction record, and refuses one without it', async () => {
    const result = await getCandidate(send(ok(detail())), 'c1')
    expect(result.applications[0]?.extraction).toMatchObject({ status: 'done', source: 'model' })
    const value = detail()
    const withoutExtraction = { ...value, applications: value.applications.map(({ extraction: _ignored, ...rest }) => rest) }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(getCandidate(send(ok(withoutExtraction)), 'c1')).rejects.toMatchObject({ code: 'invalid_response' })
    spy.mockRestore()
  })

  it('names the pipeline a profile is opened from, so a person still to reconfirm can be shown there', async () => {
    expect(candidateUrl('c 1')).toBe('/api/v1/candidates/c%201')
    expect(candidateUrl('c1', 'job/1')).toBe('/api/v1/candidates/c1?viaJobId=job%2F1')
    const get = send(ok(detail()))
    await getCandidate(get, 'c1', 'job_1')
    expect(get.mock.calls[0]?.[0]).toBe('/api/v1/candidates/c1?viaJobId=job_1')
  })

  it('updates tags and adds notes', async () => {
    const patch = send(ok(detail()))
    await updateCandidateTags(patch, 'c1', ['go'])
    expect(patch.mock.calls[0]).toEqual(['/api/v1/candidates/c1', { method: 'PATCH', body: { tags: ['go'] } }])
    const post = send(ok(note('n2')))
    await addNote(post, 'c1', 'Bene', 'a1')
    expect(post.mock.calls[0]).toEqual(['/api/v1/candidates/c1/notes', { method: 'POST', body: { body: 'Bene', applicationId: 'a1' } }])
    const general = send(ok(note('n3', { applicationId: null })))
    await addNote(general, 'c1', 'Bene', null)
    expect(general.mock.calls[0]?.[1]).toEqual({ method: 'POST', body: { body: 'Bene' } })
  })

  it('points at the cv through the same-origin proxy', () => {
    expect(cvUrl('a/1', 'inline')).toBe('/api/v1/applications/a%2F1/cv?disposition=inline')
    expect(cvUrl('a1', 'attachment')).toBe('/api/v1/applications/a1/cv?disposition=attachment')
  })
})

describe('privacy notice calls', () => {
  it('reads the active notice or null', async () => {
    expect((await getActivePrivacyNotice(send(ok(notice()))))?.version).toBe(3)
    expect(await getActivePrivacyNotice(send(ok(null)))).toBeNull()
  })

  it('lists versions, reads the template and publishes', async () => {
    expect(await listPrivacyVersions(send(ok([notice(), notice({ id: 'pn2', version: 2 })])))).toHaveLength(2)
    const template = send(ok({ text: 'Testo' }))
    expect(await getPrivacyTemplate(template, 'en')).toBe('Testo')
    expect(template.mock.calls[0]?.[0]).toBe('/api/v1/privacy-notice/template?language=en')
    const input = { language: 'it' as const, text: 'x'.repeat(200), contactEmail: 'p@a.it', retentionDays: { selection: 365, talent_pool: 730 } }
    const publish = send(ok(notice({ version: 4 })))
    expect((await publishPrivacyNotice(publish, input)).version).toBe(4)
    expect(publish.mock.calls[0]).toEqual(['/api/v1/privacy-notice', { method: 'POST', body: input }])
  })
})
