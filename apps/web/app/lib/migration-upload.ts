import { MIGRATION_LIMITS } from '@candydati/domain'
import { z } from 'zod'
import { MIGRATIONS_PATH } from '@/lib/api-paths'
import { ApiFailure, defaultFailureKey, type FailureInfo } from './api-call'
import { AppError } from './auth-errors'
import type { XhrLike } from './import-upload'

/**
 * `POST /api/v1/migrations` with upload progress: `fetch` cannot report it, so this goes through `XMLHttpRequest` behind
 * the same seam as the import (tests pass a fake). One `file` part, the package ZIP.
 */
export interface MigrationRef {
  readonly id: string
  readonly status: string
}

const refSchema = z.object({ id: z.string().min(1), status: z.string() })

export const PACKAGE_LIMIT_BYTES = MIGRATION_LIMITS.totalBytes
const ZIP_NAME = /\.zip$/i

export type PackageCheck = { readonly ok: true } | { readonly ok: false; readonly key: 'notZip' | 'empty' | 'tooLarge' }

/** Pure: a courtesy check before sending (the api checks again, from the content, never from the name). */
export const checkPackageFile = (file: Pick<File, 'name' | 'size'>): PackageCheck => {
  if (file.size === 0) return { ok: false, key: 'empty' }
  if (file.size > PACKAGE_LIMIT_BYTES) return { ok: false, key: 'tooLarge' }
  if (!ZIP_NAME.test(file.name)) return { ok: false, key: 'notZip' }
  return { ok: true }
}

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const failureOf = (status: number, body: unknown): FailureInfo => {
  const error = typeof body === 'object' && body !== null ? (body as { error?: { code?: unknown; message?: unknown } }).error : undefined
  return { status, code: typeof error?.code === 'string' ? error.code : null, message: typeof error?.message === 'string' ? error.message : null, issues: [] }
}

/** The key the user sees for a refused upload: too large and not-a-ZIP have their own words. */
const uploadFailureKey = (failure: FailureInfo, body: unknown): string => {
  if (failure.status === 413 || failure.code === 'too_large') return 'migrations.upload.errors.tooLargeServer'
  const issues = (body as { error?: { issues?: { message?: unknown }[] } } | null)?.error?.issues ?? []
  if (issues.some((issue) => issue.message === 'not_a_zip')) return 'migrations.upload.errors.notZip'
  return defaultFailureKey(failure)
}

/** Pure: the migration reference from the response, or the failure as an `ApiFailure`. */
export const readMigrationUploadResponse = (status: number, text: string): MigrationRef => {
  const body = parse(text)
  if (status >= 400 || status === 0) {
    const failure = failureOf(status, body)
    throw new ApiFailure(uploadFailureKey(failure, body), failure)
  }
  const parsed = refSchema.safeParse(typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : undefined)
  if (!parsed.success) throw new AppError('errors.generic', 'invalid_response')
  return parsed.data
}

export const uploadMigrationPackage = (
  file: Blob,
  fileName: string,
  onProgress: (percent: number) => void,
  makeXhr: () => XhrLike,
): { readonly done: Promise<MigrationRef>; readonly cancel: () => void } => {
  const xhr = makeXhr()
  const done = new Promise<MigrationRef>((resolve, reject) => {
    xhr.open('POST', MIGRATIONS_PATH)
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
    body.append('file', file, fileName)
    xhr.send(body)
  })
  return { done, cancel: () => xhr.abort() }
}
