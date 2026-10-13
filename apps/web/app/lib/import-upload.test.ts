import { describe, expect, it } from 'vitest'
import { ApiFailure } from './api-call'
import { AppError } from './auth-errors'
import { readUploadResponse, uploadBody, uploadImport, type XhrLike } from './import-upload'

const blob = (name: string, path = '') => Object.assign(new Blob(['x']), { name, webkitRelativePath: path }) as Blob & { name: string; size: number; webkitRelativePath: string }

class FakeXhr implements XhrLike {
  status = 0
  responseText = ''
  upload: XhrLike['upload'] = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  opened: string[] = []
  sent: FormData | null = null
  open(method: string, url: string) {
    this.opened = [method, url]
  }
  setRequestHeader() {}
  send(body: FormData) {
    this.sent = body
  }
  abort() {
    this.onabort?.()
  }
}

describe('uploadBody', () => {
  it('sends job, stage and every file under its folder path', () => {
    const body = uploadBody({ files: [blob('a.pdf', 'cv/a.pdf'), blob('b.csv')], jobId: 'j1', stageId: 's1' })
    expect(body.get('jobId')).toBe('j1')
    expect(body.get('stageId')).toBe('s1')
    expect(body.getAll('files').map((file) => (file as File).name)).toEqual(['cv/a.pdf', 'b.csv'])
  })
})

describe('readUploadResponse', () => {
  it('returns the batch reference', () => {
    expect(readUploadResponse(201, JSON.stringify({ success: true, data: { id: 'b1', status: 'uploaded' } }))).toEqual({ id: 'b1', status: 'uploaded' })
  })

  it('turns failures into ApiFailure, with a key of its own for a batch over the limit', () => {
    const tooLarge = (() => {
      try {
        readUploadResponse(413, 'not json')
      } catch (error) {
        return error
      }
    })()
    expect(tooLarge).toBeInstanceOf(ApiFailure)
    expect((tooLarge as ApiFailure).key).toBe('imports.files.errors.tooLargeServer')
    expect(() => readUploadResponse(403, JSON.stringify({ success: false, error: { code: 'forbidden', message: 'no' } }))).toThrow('errors.forbidden')
    expect(() => readUploadResponse(200, JSON.stringify({ success: true, data: {} }))).toThrow(AppError)
  })
})

describe('uploadImport', () => {
  it('reports progress and resolves with the batch', async () => {
    const xhr = new FakeXhr()
    const progress: number[] = []
    const upload = uploadImport({ files: [blob('a.pdf')], jobId: 'j1', stageId: 's1' }, (value) => progress.push(value), () => xhr)
    expect(xhr.opened).toEqual(['POST', '/api/v1/imports'])
    xhr.upload.onprogress?.({ loaded: 50, total: 200, lengthComputable: true })
    xhr.upload.onprogress?.({ loaded: 1, total: 0, lengthComputable: false })
    xhr.status = 201
    xhr.responseText = JSON.stringify({ success: true, data: { id: 'b1', status: 'uploaded' } })
    xhr.onload?.()
    await expect(upload.done).resolves.toEqual({ id: 'b1', status: 'uploaded' })
    expect(progress).toEqual([25])
  })

  it('rejects on a network error, a failed response, or a cancel', async () => {
    const offline = new FakeXhr()
    const first = uploadImport({ files: [], jobId: 'j', stageId: 's' }, () => {}, () => offline)
    offline.onerror?.()
    await expect(first.done).rejects.toThrow('errors.unreachable')

    const failed = new FakeXhr()
    const second = uploadImport({ files: [], jobId: 'j', stageId: 's' }, () => {}, () => failed)
    failed.status = 500
    failed.onload?.()
    await expect(second.done).rejects.toBeInstanceOf(ApiFailure)

    const cancelled = new FakeXhr()
    const third = uploadImport({ files: [], jobId: 'j', stageId: 's' }, () => {}, () => cancelled)
    third.cancel()
    await expect(third.done).rejects.toThrow('imports.files.cancelled')
  })
})
