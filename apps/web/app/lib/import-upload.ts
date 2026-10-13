import { importBatchRefSchema } from '@tt/domain'
import { IMPORTS_PATH } from '@/lib/api-paths'
import { ApiFailure, defaultFailureKey, type FailureInfo } from './api-call'
import { AppError } from './auth-errors'
import { pathOf, type PickedFile } from './import-files'

/**
 * `POST /api/v1/imports` with upload progress: `fetch` cannot report it, so this goes through `XMLHttpRequest`
 * behind a tiny seam (tests pass a fake). Files keep their folder path as the multipart file name.
 */
export interface UploadInput {
  readonly files: readonly (PickedFile & Blob)[]
  readonly jobId: string
  readonly stageId: string
}

export interface XhrLike {
  open: (method: string, url: string) => void
  setRequestHeader: (name: string, value: string) => void
  send: (body: FormData) => void
  abort: () => void
  readonly status: number
  readonly responseText: string
  readonly upload: { onprogress: ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null }
  onload: (() => void) | null
  onerror: (() => void) | null
  onabort: (() => void) | null
}

export const uploadBody = (input: UploadInput): FormData => {
  const body = new FormData()
  body.append('jobId', input.jobId)
  body.append('stageId', input.stageId)
  input.files.forEach((file) => body.append('files', file, pathOf(file)))
  return body
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
  const code = typeof error?.code === 'string' ? error.code : null
  const message = typeof error?.message === 'string' ? error.message : null
  return { status, code, message, issues: [] }
}

/** Pure: the batch reference from the response, or the failure as an `ApiFailure`. */
export const readUploadResponse = (status: number, text: string): { readonly id: string; readonly status: string } => {
  const body = parse(text)
  if (status >= 400 || status === 0) {
    const failure = failureOf(status, body)
    throw new ApiFailure(failure.code === 'too_large' || status === 413 ? 'imports.files.errors.tooLargeServer' : defaultFailureKey(failure), failure)
  }
  const data = typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : undefined
  const parsed = importBatchRefSchema.safeParse(data)
  if (!parsed.success) throw new AppError('errors.generic', 'invalid_response')
  return parsed.data
}

export const uploadImport = (input: UploadInput, onProgress: (percent: number) => void, makeXhr: () => XhrLike): { readonly done: Promise<{ readonly id: string; readonly status: string }>; readonly cancel: () => void } => {
  const xhr = makeXhr()
  const done = new Promise<{ readonly id: string; readonly status: string }>((resolve, reject) => {
    xhr.open('POST', IMPORTS_PATH)
    xhr.setRequestHeader('accept', 'application/json')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    }
    xhr.onload = () => {
      try {
        resolve(readUploadResponse(xhr.status, xhr.responseText))
      } catch (error) {
        reject(error)
      }
    }
    xhr.onerror = () => reject(new ApiFailure('errors.unreachable', { status: 0, code: null, message: null, issues: [] }))
    xhr.onabort = () => reject(new AppError('imports.files.cancelled', 'aborted'))
    xhr.send(uploadBody(input))
  })
  return { done, cancel: () => xhr.abort() }
}
