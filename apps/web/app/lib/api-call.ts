import type { PageMeta } from '@tt/domain'
import { z } from 'zod'
import { AppError, authErrorKey } from './auth-errors'
import type { ApiCall, JobApiRequest } from './job-api'

/** What the api said when a call failed. `status` 0 = the api could not be reached at all. */
export interface FailureInfo {
  readonly status: number
  readonly code: string | null
  readonly message: string | null
  readonly issues: readonly { readonly path: string; readonly message: string }[]
}

/** An `AppError` that keeps the failure, so screens can react to a specific code (reload the notice, link a page). */
export class ApiFailure extends AppError {
  readonly failure: FailureInfo

  constructor(key: string, failure: FailureInfo) {
    super(key, failure.code)
    this.name = 'ApiFailure'
    this.failure = failure
  }
}

export type FailureKey = (failure: FailureInfo) => string

const CODE_KEYS: Readonly<Record<string, string>> = {
  not_found: 'errors.notFound',
  forbidden: 'errors.forbidden',
  conflict: 'errors.conflict',
  two_factor_required: 'errors.twoFactorRequired',
  email_not_verified: 'errors.emailNotVerified',
}

/** Pure: translation key for a failure, by code first, then by HTTP status. */
export const defaultFailureKey: FailureKey = (failure) => {
  if (failure.status === 0) return 'errors.unreachable'
  return (failure.code && CODE_KEYS[failure.code]) || authErrorKey({ status: failure.status })
}

const issueSchema = z.object({ path: z.string(), message: z.string() })
const failureSchema = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string(), issues: z.array(issueSchema).optional() }),
})
const metaSchema = z.object({ total: z.number().int().nonnegative(), page: z.number().int().positive(), limit: z.number().int().positive() })
const successSchema = z.object({ success: z.literal(true), data: z.unknown(), meta: metaSchema.optional() })

const failureOf = (status: number, body: unknown): FailureInfo => {
  const parsed = failureSchema.safeParse(body)
  if (!parsed.success) return { status, code: null, message: null, issues: [] }
  const { code, message, issues = [] } = parsed.data.error
  return { status, code, message, issues }
}

const send = async (request: JobApiRequest, url: string, init: ApiCall | undefined, keyOf: FailureKey) => {
  try {
    return await request(url, init)
  } catch (cause) {
    console.error('[api] request failed', url.split('?')[0], cause instanceof Error ? cause.message : cause)
    const failure: FailureInfo = { status: 0, code: null, message: null, issues: [] }
    throw new ApiFailure(keyOf(failure), failure)
  }
}

export interface ApiResult<T> {
  readonly data: T
  readonly meta: PageMeta | null
}

/**
 * One round trip through the transport seam: the envelope is checked, the data validated with `schema`, and every
 * failure becomes an `ApiFailure` whose key comes from `keyOf` (screens show it with `t`).
 */
export const callApi = async <T>(request: JobApiRequest, url: string, schema: z.ZodType<T>, init?: ApiCall, keyOf: FailureKey = defaultFailureKey): Promise<ApiResult<T>> => {
  const { status, body } = await send(request, url, init, keyOf)
  if (status >= 400 || failureSchema.safeParse(body).success) {
    const failure = failureOf(status, body)
    throw new ApiFailure(keyOf(failure), failure)
  }
  const envelope = successSchema.safeParse(body)
  const data = envelope.success ? schema.safeParse(envelope.data.data) : null
  if (!envelope.success || !data?.success) {
    console.error('[api] unexpected response shape', url.split('?')[0])
    throw new AppError('errors.generic', 'invalid_response')
  }
  return { data: data.data, meta: envelope.data.meta ?? null }
}
