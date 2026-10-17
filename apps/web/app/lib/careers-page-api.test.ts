import { describe, expect, it, vi } from 'vitest'
import { editorDto, fixtureDocument, imageAsset } from '~~/test/fixtures/careers-editor-fixtures'
import { ApiFailure } from './api-call'
import { AppError } from './auth-errors'
import {
  careersFailureKey,
  deleteCareersMedia,
  fetchPublicCareersPage,
  getCareersPageEditor,
  listCareersMedia,
  mediaUploadBody,
  publishCareersPage,
  readMediaUploadResponse,
  saveCareersPageDraft,
  isStaleRevision,
  uploadCareersMedia,
  type UploadXhr,
} from './careers-page-api'
import type { JobApiRequest } from './job-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)
const refused = (status: number, issues: { path: string; message: string }[] = [], code = 'validation_failed') => ({ status, body: { success: false, data: null, error: { code, message: 'no', issues } } })
const failure = (status: number, issues: { path: string; message: string }[] = []) => ({ status, code: null, message: null, issues })

class FakeXhr implements UploadXhr {
  status = 0
  responseText = ''
  upload: UploadXhr['upload'] = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  opened: string[] = []
  headers: string[][] = []
  sent: FormData | null = null
  open(method: string, url: string) {
    this.opened = [method, url]
  }
  setRequestHeader(name: string, value: string) {
    this.headers.push([name, value])
  }
  send(body: FormData) {
    this.sent = body
  }
  abort() {
    this.onabort?.()
  }
}

describe('careers page editor calls', () => {
  it('loads, saves the whole document and publishes, validating each answer', async () => {
    const dto = editorDto({ draft: fixtureDocument(), isDefault: false })
    const load = send(ok(dto))
    expect((await getCareersPageEditor(load)).organization.slug).toBe('acme')
    expect(load.mock.calls[0]?.[0]).toBe('/api/v1/careers-page')

    const save = send(ok(dto))
    await saveCareersPageDraft(save, 4, dto.draft)
    expect(save.mock.calls[0]).toEqual(['/api/v1/careers-page/draft', { method: 'PUT', body: { revision: 4, document: dto.draft } }])

    const publish = send(ok({ ...dto, publishedAt: '2026-10-14T10:00:00.000Z' }))
    expect((await publishCareersPage(publish, 5)).publishedAt).toBe('2026-10-14T10:00:00.000Z')
    expect(publish.mock.calls[0]).toEqual(['/api/v1/careers-page/publish', { method: 'POST', body: { revision: 5 } }])
  })

  it('tells a stale revision apart from other failures', async () => {
    const stale = send(refused(409, [], 'stale_revision'))
    const error = await saveCareersPageDraft(stale, 1, editorDto().draft).catch((caught: unknown) => caught)
    expect(isStaleRevision(error)).toBe(true)
    expect((error as { key: string }).key).toBe('careersEditor.stale.message')
    expect(isStaleRevision(new Error('x'))).toBe(false)
  })

  it('refuses an answer that is not an editor document', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(getCareersPageEditor(send(ok({ draft: {} })))).rejects.toMatchObject({ code: 'invalid_response' })
    spy.mockRestore()
  })

  it('reads the published page of an organization', async () => {
    const request = send(ok({ organization: { name: 'Acme', slug: 'acme', logo: null }, page: fixtureDocument(), media: {}, publishedAt: null }))
    expect((await fetchPublicCareersPage(request, 'a b')).page.sections).toHaveLength(10)
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/public/organizations/a%20b/careers-page')
  })
})

describe('media library calls', () => {
  it('lists the library and deletes one asset', async () => {
    expect(await listCareersMedia(send(ok([imageAsset('11111111-1111-4111-8111-111111111111')])))).toHaveLength(1)
    const remove = send(ok({ id: 'm 1' }))
    await deleteCareersMedia(remove, 'm 1')
    expect(remove.mock.calls[0]).toEqual(['/api/v1/careers-page/media/m%201', { method: 'DELETE' }])
  })

  it('says why a delete is refused', async () => {
    const error = await deleteCareersMedia(send(refused(409, [{ path: 'mediaId', message: 'in_published_page' }], 'conflict')), 'm1').catch((caught: unknown) => caught)
    expect((error as ApiFailure).key).toBe('careersEditor.media.errors.in_published_page')
  })
})

describe('careersFailureKey', () => {
  it('maps media issues, a 413, and falls back to the usual keys', () => {
    expect(careersFailureKey(failure(422, [{ path: 'file', message: 'alt_required' }]))).toBe('careersEditor.media.errors.alt_required')
    expect(careersFailureKey(failure(413))).toBe('careersEditor.media.errors.too_large')
    expect(careersFailureKey(failure(0))).toBe('errors.unreachable')
    expect(careersFailureKey({ ...failure(403), code: 'forbidden' })).toBe('errors.forbidden')
    expect(careersFailureKey(failure(422, [{ path: 'email', message: 'email_not_configured' }]))).toBe('errors.emailNotConfigured')
  })
})

describe('upload', () => {
  it('sends the file with its trimmed descriptions only', () => {
    const body = mediaUploadBody({ file: Object.assign(new Blob(['x']), { name: 'a.png' }), alt: { it: ' Ufficio ', en: '  ' } })
    expect(body.get('alt.it')).toBe('Ufficio')
    expect(body.has('alt.en')).toBe(false)
    expect((body.get('file') as File).name).toBe('a.png')
    expect((mediaUploadBody({ file: new Blob(['x']), alt: {} }).get('file') as File).name).toBe('upload')
  })

  it('reads the stored asset, or the failure with its careers key', () => {
    const asset = imageAsset('11111111-1111-4111-8111-111111111111')
    expect(readMediaUploadResponse(201, JSON.stringify({ success: true, data: asset })).id).toBe(asset.id)
    expect(() => readMediaUploadResponse(422, JSON.stringify({ success: false, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'file', message: 'library_full' }] } }))).toThrow('careersEditor.media.errors.library_full')
    expect(() => readMediaUploadResponse(413, 'not json')).toThrow('careersEditor.media.errors.too_large')
    expect(() => readMediaUploadResponse(500, JSON.stringify({ error: 'x' }))).toThrow(ApiFailure)
    expect(() => readMediaUploadResponse(201, JSON.stringify({ success: true, data: {} }))).toThrow(AppError)
  })

  it('reports progress and resolves with the asset', async () => {
    const xhr = new FakeXhr()
    const progress: number[] = []
    const upload = uploadCareersMedia({ file: new Blob(['x']), alt: { it: 'a' } }, (value) => progress.push(value), () => xhr)
    expect(xhr.opened).toEqual(['POST', '/api/v1/careers-page/media'])
    expect(xhr.headers).toEqual([['accept', 'application/json']])
    xhr.upload.onprogress?.({ loaded: 30, total: 120, lengthComputable: true })
    xhr.upload.onprogress?.({ loaded: 1, total: 0, lengthComputable: false })
    xhr.status = 201
    xhr.responseText = JSON.stringify({ success: true, data: imageAsset('11111111-1111-4111-8111-111111111111') })
    xhr.onload?.()
    await expect(upload.done).resolves.toMatchObject({ kind: 'image' })
    expect(progress).toEqual([25])
  })

  it('rejects on a network error, a refusal or a cancel', async () => {
    const offline = new FakeXhr()
    const first = uploadCareersMedia({ file: new Blob(['x']), alt: {} }, () => {}, () => offline)
    offline.onerror?.()
    await expect(first.done).rejects.toThrow('errors.unreachable')

    const failed = new FakeXhr()
    const second = uploadCareersMedia({ file: new Blob(['x']), alt: {} }, () => {}, () => failed)
    failed.status = 422
    failed.responseText = JSON.stringify({ success: false, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'file', message: 'unsupported_type' }] } })
    failed.onload?.()
    await expect(second.done).rejects.toThrow('careersEditor.media.errors.unsupported_type')

    const cancelled = new FakeXhr()
    const third = uploadCareersMedia({ file: new Blob(['x']), alt: {} }, () => {}, () => cancelled)
    third.cancel()
    await expect(third.done).rejects.toThrow('careersEditor.media.errors.cancelled')
  })
})
