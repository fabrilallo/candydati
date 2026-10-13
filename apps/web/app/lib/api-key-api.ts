import type { Permission } from '@tt/domain'
import { z } from 'zod'
import { ApiFailure, callApi, defaultFailureKey, type FailureInfo } from './api-call'
import { AppError } from './auth-errors'
import type { JobApiRequest } from './job-api'
import { openApiDocumentSchema, type OpenApiDocument } from './openapi-reference'
import { API_KEYS_PATH, apiKeyCreatedSchema, apiKeyPath, apiKeySchema, OPENAPI_PATH, type ApiKeyCreatedDto, type ApiKeyDto } from './phase6-contract'

/** API keys of the organization (`api_key:manage`) and the OpenAPI document (phase 6 contract). */
export interface ApiKeyCreateInput {
  readonly name: string
  readonly scopes: readonly Permission[]
  readonly expiresAt: string | null
}

export const listApiKeys = async (request: JobApiRequest): Promise<readonly ApiKeyDto[]> => (await callApi(request, API_KEYS_PATH, z.array(apiKeySchema))).data

/** The only answer that carries the secret: show it once, never store it. */
export const createApiKey = async (request: JobApiRequest, input: ApiKeyCreateInput): Promise<ApiKeyCreatedDto> => {
  const body = { name: input.name, scopes: input.scopes, ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}) }
  return (await callApi(request, API_KEYS_PATH, apiKeyCreatedSchema, { method: 'POST', body })).data
}

export const revokeApiKey = async (request: JobApiRequest, id: string): Promise<void> => {
  await callApi(request, apiKeyPath(id), z.unknown(), { method: 'DELETE' })
}

const unwrap = (body: unknown): unknown =>
  typeof body === 'object' && body !== null && (body as { success?: unknown }).success === true ? (body as { data?: unknown }).data : body

/** The spec is a plain OpenAPI document (or, from an older api, one inside the envelope). */
export const getOpenApiSpec = async (request: JobApiRequest): Promise<OpenApiDocument> => {
  const response = await request(OPENAPI_PATH).catch((cause: unknown) => {
    console.error('[api] openapi unreachable', cause instanceof Error ? cause.message : cause)
    const failure: FailureInfo = { status: 0, code: null, message: null, issues: [] }
    throw new ApiFailure(defaultFailureKey(failure), failure)
  })
  if (response.status >= 400) {
    const failure: FailureInfo = { status: response.status, code: null, message: null, issues: [] }
    throw new ApiFailure(defaultFailureKey(failure), failure)
  }
  const parsed = openApiDocumentSchema.safeParse(unwrap(response.body))
  if (!parsed.success) throw new AppError('errors.generic', 'invalid_response')
  return parsed.data
}
