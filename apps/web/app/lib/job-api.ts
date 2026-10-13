import type {
  AdQualityAssessment,
  JobContent,
  JobDto,
  JobStatsDto,
  JobStatus,
  JobSummaryDto,
  JobTemplateDto,
  PageMeta,
  PublicCareersDto,
  PublicJobPageDto,
  PublishIssue,
  PublishJobResultDto,
} from '@tt/domain'
import { jobStatsDtoSchema } from '@tt/domain'
import { z } from 'zod'
import { AppError, authErrorKey, errorKeyOf } from './auth-errors'
import {
  deletedSchema,
  jobSchema,
  jobSummarySchema,
  publicCareersSchema,
  publicJobPageSchema,
  publishResultSchema,
  qualityResultSchema,
  templateSchema,
} from './job-api-schemas'

export const JOB_PAGE_SIZE = 20

export interface ApiCall {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  readonly body?: unknown
}
/** Transport seam: returns the HTTP status and the parsed body. Never throws on non-2xx. */
export type JobApiRequest = (url: string, call?: ApiCall) => Promise<{ readonly status: number; readonly body: unknown }>

export type RawJobFetch = (
  url: string,
  options: { ignoreResponseError: true; headers: Record<string, string>; method?: string; body?: unknown },
) => Promise<{ status: number; _data?: unknown }>

/** Adapts Nuxt's `$fetch.raw` (cookies forwarded by the caller) to the seam. */
export const toJobRequest =
  (raw: RawJobFetch): JobApiRequest =>
  async (url, call = {}) => {
    const response = await raw(url, {
      ignoreResponseError: true,
      headers: { accept: 'application/json' },
      ...(call.method ? { method: call.method } : {}),
      ...(call.body === undefined ? {} : { body: call.body }),
    })
    return { status: response.status, body: response._data }
  }

const metaSchema = z.object({ total: z.number().int().nonnegative(), page: z.number().int().positive(), limit: z.number().int().positive() })
const failureSchema = z.object({ success: z.literal(false), data: z.null(), error: z.object({ code: z.string(), message: z.string() }) })
const successSchema = z.object({ success: z.literal(true), data: z.unknown(), error: z.null().optional(), meta: metaSchema.optional() })

const CODE_KEYS: Readonly<Record<string, string>> = {
  conflict: 'job.errors.conflict',
  validation_failed: 'job.errors.validationFailed',
  not_found: 'errors.notFound',
  forbidden: 'errors.forbidden',
}

/** Pure: translation key for an api error code, falling back to the HTTP status. */
export const jobErrorKey = (code: string | null, status: number): string => (code && CODE_KEYS[code]) || authErrorKey({ status })

const send = async (request: JobApiRequest, url: string, call?: ApiCall) => {
  try {
    return await request(url, call)
  } catch (cause) {
    console.error('[job-api] request failed', cause instanceof Error ? cause.message : cause)
    throw new AppError('errors.unreachable')
  }
}

interface Parsed<T> {
  readonly data: T
  readonly meta: PageMeta | null
}

/** One round trip: envelope checked, data validated with `schema`, failures become `AppError`s with a translation key. */
const call = async <T>(request: JobApiRequest, url: string, schema: z.ZodType<T>, init?: ApiCall): Promise<Parsed<T>> => {
  const { status, body } = await send(request, url, init)
  const failure = failureSchema.safeParse(body)
  if (failure.success) throw new AppError(jobErrorKey(failure.data.error.code, status), failure.data.error.code)
  const envelope = successSchema.safeParse(body)
  const data = envelope.success ? schema.safeParse(envelope.data.data) : null
  if (!envelope.success || !data?.success || status >= 400) {
    if (status >= 400) throw new AppError(authErrorKey({ status }))
    console.error('[job-api] unexpected response shape', url)
    throw new AppError('errors.generic', 'invalid_response')
  }
  return { data: data.data, meta: envelope.success ? (envelope.data.meta ?? null) : null }
}

export interface JobListPage {
  readonly jobs: readonly JobSummaryDto[]
  readonly meta: PageMeta
}

export const jobsUrl = (status: JobStatus | null, page: number, limit: number): string =>
  `/api/v1/jobs?${status ? `status=${status}&` : ''}page=${page}&limit=${limit}`

export const listJobs = async (request: JobApiRequest, status: JobStatus | null, page: number, limit: number = JOB_PAGE_SIZE): Promise<JobListPage> => {
  const { data, meta } = await call(request, jobsUrl(status, page, limit), z.array(jobSummarySchema))
  if (!meta) throw new AppError('errors.generic', 'invalid_response')
  return { jobs: data as readonly JobSummaryDto[], meta }
}

const asJob = (parsed: Parsed<unknown>): JobDto => parsed.data as JobDto
const post = (body: unknown): ApiCall => ({ method: 'POST', body })

export const getJob = async (request: JobApiRequest, id: string): Promise<JobDto> => asJob(await call(request, `/api/v1/jobs/${encodeURIComponent(id)}`, jobSchema))
export const createJob = async (request: JobApiRequest, content: JobContent, templateId?: string): Promise<JobDto> =>
  asJob(await call(request, '/api/v1/jobs', jobSchema, post({ content, ...(templateId ? { templateId } : {}) })))
export const updateJob = async (request: JobApiRequest, id: string, content: JobContent): Promise<JobDto> =>
  asJob(await call(request, `/api/v1/jobs/${encodeURIComponent(id)}`, jobSchema, { method: 'PUT', body: { content } }))
export const closeJob = async (request: JobApiRequest, id: string): Promise<JobDto> =>
  asJob(await call(request, `/api/v1/jobs/${encodeURIComponent(id)}/close`, jobSchema, post({})))
export const publishJob = async (request: JobApiRequest, id: string): Promise<PublishJobResultDto> =>
  (await call(request, `/api/v1/jobs/${encodeURIComponent(id)}/publish`, publishResultSchema, post({}))).data as PublishJobResultDto

export interface QualityResult {
  readonly assessment: AdQualityAssessment
  readonly publishIssues: readonly PublishIssue[]
}
export const analyzeQuality = async (request: JobApiRequest, content: JobContent): Promise<QualityResult> =>
  (await call(request, '/api/v1/jobs/quality', qualityResultSchema, post({ content }))).data as QualityResult

export const listTemplates = async (request: JobApiRequest): Promise<readonly JobTemplateDto[]> =>
  (await call(request, '/api/v1/job-templates', z.array(templateSchema))).data as readonly JobTemplateDto[]
export const createTemplate = async (request: JobApiRequest, name: string, content: JobContent): Promise<JobTemplateDto> =>
  (await call(request, '/api/v1/job-templates', templateSchema, post({ name, content }))).data as JobTemplateDto
export const deleteTemplate = async (request: JobApiRequest, id: string): Promise<void> => {
  await call(request, `/api/v1/job-templates/${encodeURIComponent(id)}`, deletedSchema, { method: 'DELETE' })
}

/** Aggregates of the organization's ads for the overview, validated against the shared schema. */
export const getJobStats = async (request: JobApiRequest): Promise<JobStatsDto> => (await call(request, '/api/v1/stats/jobs', jobStatsDtoSchema)).data

const publicBase = (org: string): string => `/api/v1/public/organizations/${encodeURIComponent(org)}/jobs`
export const fetchCareers = async (request: JobApiRequest, org: string): Promise<PublicCareersDto> =>
  (await call(request, publicBase(org), publicCareersSchema)).data
export const fetchPublicJob = async (request: JobApiRequest, org: string, job: string): Promise<PublicJobPageDto> =>
  (await call(request, `${publicBase(org)}/${encodeURIComponent(job)}`, publicJobPageSchema)).data

export type Loaded<T> = { readonly data: T; readonly errorKey: null } | { readonly data: null; readonly errorKey: string }

/** Never throws: the screen gets the data or the translation key to show (nothing is swallowed, nothing crashes the render). */
export const loaded = async <T>(load: () => Promise<T>): Promise<Loaded<T>> => {
  try {
    return { data: await load(), errorKey: null }
  } catch (error) {
    return { data: null, errorKey: errorKeyOf(error) }
  }
}
