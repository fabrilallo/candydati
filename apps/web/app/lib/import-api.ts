import { toImportDetail, type ImportDetail, type ItemsInput } from '@/lib/import-item-view'
import { importCommitPath, importItemsPath, importMappingPath, importPath, IMPORTS_PATH, importUndoPath, publicConsentPath } from '@/lib/api-paths'
import { IMPORT_ITEMS_PAGE_MAX, IMPORT_LIMITS, consentAnswerSchema, importBatchSchema, importBatchPageSchema, publicConsentSchema, undoImportSchema, type ImportBatchDto, type ImportMapping, type PublicConsentDto, type UndoImportDto } from '@tt/domain'
import { z } from 'zod'
import { ApiFailure, callApi } from './api-call'
import type { JobApiRequest } from './job-api'

/** Import batches and the public reconfirmation (phase 8 contract, "HTTP"). Upload is in `import-upload.ts`. */
export const ITEMS_PAGE = IMPORT_ITEMS_PAGE_MAX
const MAX_PAGES = Math.ceil(IMPORT_LIMITS.maxRows / IMPORT_ITEMS_PAGE_MAX) + 1

export const listImports = async (request: JobApiRequest): Promise<readonly ImportBatchDto[]> => (await callApi(request, IMPORTS_PATH, z.array(importBatchSchema))).data

/** The batch with every preview item: the preview filters on the client, so all pages are read (bounded by the row limit). */
export const getImport = async (request: JobApiRequest, batchId: string): Promise<ImportDetail> => {
  const first = await callApi(request, `${importPath(batchId)}?page=1&limit=${ITEMS_PAGE}`, importBatchPageSchema)
  const total = first.data.total
  const pages = Math.min(MAX_PAGES, Math.ceil(total / ITEMS_PAGE))
  if (pages <= 1) return toImportDetail(first.data)
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) => callApi(request, `${importPath(batchId)}?page=${index + 2}&limit=${ITEMS_PAGE}`, importBatchPageSchema)),
  )
  return toImportDetail({ batch: first.data.batch, items: [...first.data.items, ...rest.flatMap((page) => page.data.items)] })
}

/** The answer is the batch with its first page of items; the wizard reloads, so only the batch is returned. */
export const saveMapping = async (request: JobApiRequest, batchId: string, input: ImportMapping): Promise<ImportBatchDto> =>
  (await callApi(request, importMappingPath(batchId), importBatchPageSchema, { method: 'PUT', body: input })).data.batch

export const saveItems = async (request: JobApiRequest, batchId: string, input: ItemsInput): Promise<void> => {
  await callApi(request, importItemsPath(batchId), importBatchPageSchema, { method: 'PUT', body: input })
}

export const commitImport = async (request: JobApiRequest, batchId: string): Promise<ImportBatchDto> =>
  (await callApi(request, importCommitPath(batchId), importBatchSchema, { method: 'POST', body: {} })).data

export const undoImport = async (request: JobApiRequest, batchId: string): Promise<UndoImportDto> =>
  (await callApi(request, importUndoPath(batchId), undoImportSchema, { method: 'POST', body: {} })).data

export type ConsentFailure = 'invalid' | 'expired' | 'used' | 'rateLimited' | 'unavailable'

/** Pure: what the public page says when the token does not work. */
export const consentFailure = (error: unknown): ConsentFailure => {
  if (!(error instanceof ApiFailure)) return 'unavailable'
  const { status, code } = error.failure
  if (status === 410 || code === 'expired' || code === 'token_expired') return 'expired'
  if (status === 409 || code === 'already_used' || code === 'token_used') return 'used'
  if (status === 429) return 'rateLimited'
  if (status === 404 || status === 400 || code === 'not_found') return 'invalid'
  return 'unavailable'
}

export type ConsentLoad = { readonly kind: 'ok'; readonly data: PublicConsentDto } | { readonly kind: 'failed'; readonly failure: ConsentFailure }

/** Never throws: the page shows the request or the reason it cannot. */
export const loadConsent = async (request: JobApiRequest, token: string): Promise<ConsentLoad> => {
  try {
    return { kind: 'ok', data: (await callApi(request, publicConsentPath(token), publicConsentSchema)).data }
  } catch (error) {
    const failure = consentFailure(error)
    if (failure === 'unavailable') console.error('[consent] load failed', error instanceof Error ? error.message : error)
    return { kind: 'failed', failure }
  }
}

export type ConsentAnswer = { readonly scopes: readonly ('selection' | 'talent_pool')[] } | { readonly decline: true }

/** Pure: the body of the answer. Selection is the consent being renewed; the talent pool stays a free choice. */
export const consentAnswer = (choice: 'confirm' | 'decline', talentPool: boolean): ConsentAnswer =>
  choice === 'decline' ? { decline: true } : { scopes: talentPool ? ['selection', 'talent_pool'] : ['selection'] }

export const answerConsent = async (request: JobApiRequest, token: string, answer: ConsentAnswer): Promise<void> => {
  await callApi(request, publicConsentPath(token), consentAnswerSchema, { method: 'POST', body: answer })
}
