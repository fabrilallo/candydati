import { describe, expect, it, vi } from 'vitest'
import type { ApiFailure } from './api-call'
import type { XhrLike } from './import-upload'
import { checkCvsFile, checkSheetFile, connectorGuideUrl, CVS_LIMIT_BYTES, SHEET_LIMIT_BYTES, uploadConnectorFiles } from './migration-files'
import { readMigrationUploadResponse } from './migration-upload'

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

describe('file checks', () => {
  it('accepts a spreadsheet by extension and refuses what cannot be one', () => {
    for (const name of ['export.csv', 'export.CSV', 'export.tsv', 'export.xlsx']) expect(checkSheetFile({ name, size: 10 })).toEqual({ ok: true })
    expect(checkSheetFile({ name: 'export.pdf', size: 10 })).toEqual({ ok: false, key: 'notSheet' })
    expect(checkSheetFile({ name: 'export.csv', size: 0 })).toEqual({ ok: false, key: 'empty' })
    expect(checkSheetFile({ name: 'export.csv', size: SHEET_LIMIT_BYTES + 1 })).toEqual({ ok: false, key: 'tooLarge' })
  })

  it('accepts a ZIP of CVs and refuses the rest', () => {
    expect(checkCvsFile({ name: 'cvs.zip', size: 10 })).toEqual({ ok: true })
    expect(checkCvsFile({ name: 'cvs.rar', size: 10 })).toEqual({ ok: false, key: 'notZip' })
    expect(checkCvsFile({ name: 'cvs.zip', size: 0 })).toEqual({ ok: false, key: 'empty' })
    expect(checkCvsFile({ name: 'cvs.zip', size: CVS_LIMIT_BYTES + 1 })).toEqual({ ok: false, key: 'tooLarge' })
  })
})

describe('guide link', () => {
  it('points to the connector section of the guide, in Italian or English', () => {
    expect(connectorGuideUrl('inrecruiting', 'it')).toBe('https://fabrilallo.github.io/candydati/it/guide/migration#inrecruiting')
    expect(connectorGuideUrl('inrecruiting', 'en')).toBe('https://fabrilallo.github.io/candydati/guide/migration#inrecruiting')
  })
})

describe('uploadConnectorFiles', () => {
  it('posts the sheet and the CVs as two parts with progress, and can be stopped', async () => {
    const xhr = new FakeXhr()
    const progress: number[] = []
    const run = uploadConnectorFiles('inrecruiting', { sheet: new File(['a'], 'export.csv'), cvs: new File(['b'], 'cvs.zip') }, (value) => progress.push(value), () => xhr)
    expect(xhr.opened).toEqual(['POST', '/api/v1/migrations/connector/inrecruiting/files'])
    expect((xhr.sent?.get('sheet') as File).name).toBe('export.csv')
    expect((xhr.sent?.get('cvs') as File).name).toBe('cvs.zip')
    xhr.upload.onprogress?.({ loaded: 50, total: 200, lengthComputable: true })
    expect(progress).toEqual([25])
    xhr.status = 201
    xhr.responseText = JSON.stringify({ success: true, data: { id: 'm1', status: 'fetching' } })
    xhr.onload?.()
    await expect(run.done).resolves.toEqual({ id: 'm1', status: 'fetching' })

    const stopped = new FakeXhr()
    const second = uploadConnectorFiles('inrecruiting', { sheet: new File(['a'], 'export.csv'), cvs: null }, () => undefined, () => stopped)
    expect(stopped.sent?.has('cvs')).toBe(false)
    second.cancel()
    await expect(second.done).rejects.toMatchObject({ key: 'migrations.upload.cancelled' })
  })

  it('reports an unreachable api and a refusal in words the user can read', async () => {
    const xhr = new FakeXhr()
    const run = uploadConnectorFiles('inrecruiting', { sheet: new File(['a'], 'export.csv'), cvs: null }, () => undefined, () => xhr)
    xhr.onerror?.()
    await expect(run.done).rejects.toMatchObject({ key: 'errors.unreachable' })
    const refused = (message: string): ApiFailure => {
      try {
        readMigrationUploadResponse(422, JSON.stringify({ success: false, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'sheet', message }] } }))
      } catch (error) {
        return error as ApiFailure
      }
      throw new Error('did not fail')
    }
    expect(refused('not_a_spreadsheet').key).toBe('migrations.files.errors.notSheet')
    expect(refused('sheet_too_large').key).toBe('migrations.files.errors.tooLargeServer')
    expect(refused('file_missing').key).toBe('migrations.files.errors.sheetMissing')
    expect(refused('connector_unknown').key).toBe('migrations.connector.errors.unknown')
  })
})
