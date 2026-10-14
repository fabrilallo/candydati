import {
  CAREERS_STALE_REVISION,
  careersMediaAssetSchema,
  careersPageEditorSchema,
  publicCareersPageSchema,
  type CareersMediaAssetDto,
  type CareersPageDocumentInput,
  type CareersPageEditorDto,
  type PublicCareersPageDto,
} from '@tt/domain'
import { z } from 'zod'
import { ApiFailure, callApi, defaultFailureKey, type FailureInfo } from './api-call'
import { AppError } from './auth-errors'
import type { JobApiRequest } from './job-api'

/** Paths of the careers page builder (session only) and of its public read. */
export const CAREERS_PAGE_PATH = '/api/v1/careers-page'
export const CAREERS_PAGE_DRAFT_PATH = `${CAREERS_PAGE_PATH}/draft`
export const CAREERS_PAGE_PUBLISH_PATH = `${CAREERS_PAGE_PATH}/publish`
export const CAREERS_MEDIA_PATH = `${CAREERS_PAGE_PATH}/media`
export const careersMediaItemPath = (id: string): string => `${CAREERS_MEDIA_PATH}/${encodeURIComponent(id)}`
export const publicCareersPagePath = (org: string): string => `/api/v1/public/organizations/${encodeURIComponent(org)}/careers-page`

export const fetchPublicCareersPage = async (request: JobApiRequest, org: string): Promise<PublicCareersPageDto> =>
  (await callApi(request, publicCareersPagePath(org), publicCareersPageSchema)).data

export const getCareersPageEditor = async (request: JobApiRequest): Promise<CareersPageEditorDto> => (await callApi(request, CAREERS_PAGE_PATH, careersPageEditorSchema)).data

/** Saves over `revision`, the one the editor loaded; refused with `stale_revision` when someone saved meanwhile. */
export const saveCareersPageDraft = async (request: JobApiRequest, revision: number, document: CareersPageDocumentInput): Promise<CareersPageEditorDto> =>
  (await callApi(request, CAREERS_PAGE_DRAFT_PATH, careersPageEditorSchema, { method: 'PUT', body: { revision, document } }, careersFailureKey)).data

export const publishCareersPage = async (request: JobApiRequest, revision: number): Promise<CareersPageEditorDto> =>
  (await callApi(request, CAREERS_PAGE_PUBLISH_PATH, careersPageEditorSchema, { method: 'POST', body: { revision } }, careersFailureKey)).data

/** Someone else saved or published the page after this editor loaded it. */
export const isStaleRevision = (error: unknown): boolean => error instanceof ApiFailure && error.failure.code === CAREERS_STALE_REVISION

export const listCareersMedia = async (request: JobApiRequest): Promise<readonly CareersMediaAssetDto[]> =>
  (await callApi(request, CAREERS_MEDIA_PATH, z.array(careersMediaAssetSchema))).data

export const deleteCareersMedia = async (request: JobApiRequest, id: string): Promise<void> => {
  await callApi(request, careersMediaItemPath(id), z.object({ id: z.string() }), { method: 'DELETE' }, careersFailureKey)
}

/** Issues the api reports for media (`file` and `mediaId`), each with its own message in the interface. */
const MEDIA_ISSUES = new Set(['unsupported_type', 'too_large', 'empty', 'alt_required', 'image_unreadable', 'image_too_big', 'library_full', 'in_published_page', 'in_draft'])

/** Translation key of a careers page failure: the specific media issue when there is one, else the generic mapping. */
export const careersFailureKey = (failure: FailureInfo): string => {
  if (failure.code === CAREERS_STALE_REVISION) return 'careersEditor.stale.message'
  const issue = failure.issues.find((candidate) => MEDIA_ISSUES.has(candidate.message))
  if (issue) return `careersEditor.media.errors.${issue.message}`
  if (failure.status === 413) return 'careersEditor.media.errors.too_large'
  return defaultFailureKey(failure)
}

/** The browser's upload seam (`XMLHttpRequest`, for progress); tests pass a fake. */
export interface UploadXhr {
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

export interface MediaUploadInput {
  readonly file: Blob & { readonly name?: string }
  readonly alt: { readonly it?: string; readonly en?: string }
}

export const mediaUploadBody = (input: MediaUploadInput): FormData => {
  const body = new FormData()
  for (const [locale, text] of Object.entries(input.alt)) if (text && text.trim() !== '') body.append(`alt.${locale}`, text.trim())
  body.append('file', input.file, input.file.name ?? 'upload')
  return body
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const issuesSchema = z.array(z.object({ path: z.string(), message: z.string() }))
const failureOfUpload = (status: number, body: unknown): FailureInfo => {
  const error = typeof body === 'object' && body !== null ? (body as { error?: Record<string, unknown> }).error : undefined
  const issues = issuesSchema.safeParse(error?.issues)
  return {
    status,
    code: typeof error?.code === 'string' ? error.code : null,
    message: typeof error?.message === 'string' ? error.message : null,
    issues: issues.success ? issues.data : [],
  }
}

/** Pure: the stored asset from the upload response, or the failure as an `ApiFailure` with a careers key. */
export const readMediaUploadResponse = (status: number, text: string): CareersMediaAssetDto => {
  const body = parseJson(text)
  if (status >= 400 || status === 0) {
    const failure = failureOfUpload(status, body)
    throw new ApiFailure(careersFailureKey(failure), failure)
  }
  const data = typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : undefined
  const parsed = careersMediaAssetSchema.safeParse(data)
  if (!parsed.success) throw new AppError('errors.generic', 'invalid_response')
  return parsed.data
}

/** `POST /api/v1/careers-page/media` with progress (0 to 100). `cancel` aborts the request. */
export const uploadCareersMedia = (
  input: MediaUploadInput,
  onProgress: (percent: number) => void,
  makeXhr: () => UploadXhr,
): { readonly done: Promise<CareersMediaAssetDto>; readonly cancel: () => void } => {
  const xhr = makeXhr()
  const done = new Promise<CareersMediaAssetDto>((resolve, reject) => {
    xhr.open('POST', CAREERS_MEDIA_PATH)
    xhr.setRequestHeader('accept', 'application/json')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    }
    xhr.onload = () => {
      try {
        resolve(readMediaUploadResponse(xhr.status, xhr.responseText))
      } catch (error) {
        reject(error)
      }
    }
    xhr.onerror = () => reject(new ApiFailure('errors.unreachable', { status: 0, code: null, message: null, issues: [] }))
    xhr.onabort = () => reject(new AppError('careersEditor.media.errors.cancelled', 'cancelled'))
    xhr.send(mediaUploadBody(input))
  })
  return { done, cancel: () => xhr.abort() }
}
