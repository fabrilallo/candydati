import { MIGRATION_SHEET_MAX_BYTES } from '@candydati/domain'
import { migrationConnectorFilesPath } from '@/lib/api-paths'
import { ApiFailure } from './api-call'
import { AppError } from './auth-errors'
import type { XhrLike } from './import-upload'
import { PACKAGE_LIMIT_BYTES, readMigrationUploadResponse, type MigrationRef } from './migration-upload'

/**
 * `POST /api/v1/migrations/connector/:id/files` with upload progress, for a connector that reads an export instead of an
 * API (`input: 'files'`): a `sheet` part (CSV or XLSX) and an optional `cvs` part (a ZIP). Same seam as the package
 * upload, so tests pass a fake `XMLHttpRequest`.
 */
export const SHEET_LIMIT_BYTES = MIGRATION_SHEET_MAX_BYTES
export const CVS_LIMIT_BYTES = PACKAGE_LIMIT_BYTES

export type FileCheck = { readonly ok: true } | { readonly ok: false; readonly key: 'notSheet' | 'notZip' | 'empty' | 'tooLarge' }

/** Pure: a courtesy check before sending (the api checks again, from the content, never from the name). */
export const checkSheetFile = (file: Pick<File, 'name' | 'size'>): FileCheck => {
  if (file.size === 0) return { ok: false, key: 'empty' }
  if (file.size > SHEET_LIMIT_BYTES) return { ok: false, key: 'tooLarge' }
  return /\.(csv|tsv|xlsx)$/i.test(file.name) ? { ok: true } : { ok: false, key: 'notSheet' }
}

export const checkCvsFile = (file: Pick<File, 'name' | 'size'>): FileCheck => {
  if (file.size === 0) return { ok: false, key: 'empty' }
  if (file.size > CVS_LIMIT_BYTES) return { ok: false, key: 'tooLarge' }
  return /\.zip$/i.test(file.name) ? { ok: true } : { ok: false, key: 'notZip' }
}

/** Where the documentation site is published: change it here when it moves. */
export const DOCS_BASE_URL = 'https://fabrilallo.github.io/candydati'

/** The short guide for the connector's export, in the user's language (English when it is not Italian). */
export const connectorGuideUrl = (connectorId: string, locale: string): string => `${DOCS_BASE_URL}${locale === 'it' ? '/it' : ''}/guide/migration#${encodeURIComponent(connectorId)}`

export interface FilesUpload {
  readonly sheet: File
  readonly cvs: File | null
}

export const uploadConnectorFiles = (
  connectorId: string,
  files: FilesUpload,
  onProgress: (percent: number) => void,
  makeXhr: () => XhrLike,
): { readonly done: Promise<MigrationRef>; readonly cancel: () => void } => {
  const xhr = makeXhr()
  const done = new Promise<MigrationRef>((resolve, reject) => {
    xhr.open('POST', migrationConnectorFilesPath(connectorId))
    xhr.setRequestHeader('accept', 'application/json')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    }
    xhr.onload = () => {
      try {
        resolve(readMigrationUploadResponse(xhr.status, xhr.responseText))
      } catch (error) {
        reject(error)
      }
    }
    xhr.onerror = () => reject(new ApiFailure('errors.unreachable', { status: 0, code: null, message: null, issues: [] }))
    xhr.onabort = () => reject(new AppError('migrations.upload.cancelled', 'aborted'))
    const body = new FormData()
    body.append('sheet', files.sheet, files.sheet.name)
    if (files.cvs) body.append('cvs', files.cvs, files.cvs.name)
    xhr.send(body)
  })
  return { done, cancel: () => xhr.abort() }
}
