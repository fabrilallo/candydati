import { describe, expect, it, vi } from 'vitest'
import type { ApiFailure } from './api-call'
import type { XhrLike } from './import-upload'
import { checkPackageFile, PACKAGE_LIMIT_BYTES, readMigrationUploadResponse, uploadMigrationPackage } from './migration-upload'

class FakeXhr implements XhrLike {
  status = 0
  responseText = ''
  upload: XhrLike['upload'] = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  sent: FormData | null = null
  opened: [string, string] | null = null
  open = (method: string, url: string) => void (this.opened = [method, url])
  setRequestHeader = vi.fn()
  send = (body: FormData) => void (this.sent = body)
  abort = () => this.onabort?.()
}

describe('package check', () => {
  it('accepts a zip and refuses what cannot be one', () => {
    expect(checkPackageFile({ name: 'package.zip', size: 10 })).toEqual({ ok: true })
    expect(checkPackageFile({ name: 'package.ZIP', size: 10 })).toEqual({ ok: true })
    expect(checkPackageFile({ name: 'package.json', size: 10 })).toEqual({ ok: false, key: 'notZip' })
    expect(checkPackageFile({ name: 'package.zip', size: 0 })).toEqual({ ok: false, key: 'empty' })
    expect(checkPackageFile({ name: 'package.zip', size: PACKAGE_LIMIT_BYTES + 1 })).toEqual({ ok: false, key: 'tooLarge' })
  })
})

describe('upload response', () => {
  it('reads the reference of the new migration', () => {
    expect(readMigrationUploadResponse(201, JSON.stringify({ success: true, data: { id: 'm1', status: 'uploaded' } }))).toEqual({ id: 'm1', status: 'uploaded' })
  })

  it('turns refusals into keys the user can read', () => {
    const failure = (status: number, body: unknown) => {
      try {
        readMigrationUploadResponse(status, JSON.stringify(body))
      } catch (error) {
        return error as ApiFailure
      }
      throw new Error('did not fail')
    }
    expect(failure(413, { success: false }).key).toBe('migrations.upload.errors.tooLargeServer')
    expect(failure(422, { success: false, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'file', message: 'not_a_zip' }] } }).key).toBe('migrations.upload.errors.notZip')
    expect(failure(403, { success: false, error: { code: 'forbidden', message: 'x' } }).key).toBe('errors.forbidden')
    expect(() => readMigrationUploadResponse(201, 'not json')).toThrow()
  })
})

describe('uploadMigrationPackage', () => {
  it('posts one file part with progress, and can be stopped', async () => {
    const xhr = new FakeXhr()
    const progress: number[] = []
    const run = uploadMigrationPackage(new Blob(['zip']), 'package.zip', (value) => progress.push(value), () => xhr)
    expect(xhr.opened).toEqual(['POST', '/api/v1/migrations'])
    expect((xhr.sent?.get('file') as File).name).toBe('package.zip')
    xhr.upload.onprogress?.({ loaded: 50, total: 200, lengthComputable: true })
    expect(progress).toEqual([25])
    xhr.status = 201
    xhr.responseText = JSON.stringify({ success: true, data: { id: 'm1', status: 'uploaded' } })
    xhr.onload?.()
    await expect(run.done).resolves.toEqual({ id: 'm1', status: 'uploaded' })

    const stopped = new FakeXhr()
    const second = uploadMigrationPackage(new Blob(['zip']), 'package.zip', () => undefined, () => stopped)
    second.cancel()
    await expect(second.done).rejects.toMatchObject({ key: 'migrations.upload.cancelled' })
  })

  it('reports an unreachable api', async () => {
    const xhr = new FakeXhr()
    const run = uploadMigrationPackage(new Blob(['zip']), 'package.zip', () => undefined, () => xhr)
    xhr.onerror?.()
    await expect(run.done).rejects.toMatchObject({ key: 'errors.unreachable' })
  })
})
