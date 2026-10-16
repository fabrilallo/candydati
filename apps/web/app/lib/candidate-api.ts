import { type Outcome, type PageMeta, applicationCardSchema, candidateDetailSchema, candidateSummarySchema, noteSchema, pipelineSchema, type ApplicationCardDto, type CandidateDetailDto, type CandidateSummaryDto, type NoteDto, type PipelineDto    } from '@candydati/domain';
import { z } from 'zod'
import { callApi } from './api-call'
import { AppError } from './auth-errors'
import type { JobApiRequest } from './job-api'

export const CANDIDATE_PAGE_SIZE = 20

const id = (value: string): string => encodeURIComponent(value)

export const getPipeline = async (request: JobApiRequest, jobId: string): Promise<PipelineDto> =>
  (await callApi(request, `/api/v1/jobs/${id(jobId)}/pipeline`, pipelineSchema)).data

export const moveApplication = async (request: JobApiRequest, applicationId: string, stageId: string): Promise<ApplicationCardDto> =>
  (await callApi(request, `/api/v1/applications/${id(applicationId)}/move`, applicationCardSchema, { method: 'POST', body: { stageId } })).data

export const decideApplication = async (request: JobApiRequest, applicationId: string, outcome: Outcome): Promise<ApplicationCardDto> =>
  (await callApi(request, `/api/v1/applications/${id(applicationId)}/decide`, applicationCardSchema, { method: 'POST', body: { outcome } })).data

export interface CandidateFilters {
  readonly query: string
  readonly tag: string | null
  readonly talentPool: boolean
  readonly page: number
  readonly limit?: number
}

/** Only the filters that are set end up in the query string. */
export const candidatesUrl = (filters: CandidateFilters): string => {
  const params = new URLSearchParams()
  const query = filters.query.trim()
  if (query !== '') params.set('query', query)
  if (filters.tag) params.set('tag', filters.tag)
  if (filters.talentPool) params.set('talentPool', 'true')
  params.set('page', String(filters.page))
  params.set('limit', String(filters.limit ?? CANDIDATE_PAGE_SIZE))
  return `/api/v1/candidates?${params.toString()}`
}

export interface CandidatePage {
  readonly candidates: readonly CandidateSummaryDto[]
  readonly meta: PageMeta
}

export const listCandidates = async (request: JobApiRequest, filters: CandidateFilters): Promise<CandidatePage> => {
  const { data, meta } = await callApi(request, candidatesUrl(filters), z.array(candidateSummarySchema))
  if (!meta) throw new AppError('errors.generic', 'invalid_response')
  return { candidates: data, meta }
}

/** Profile address; `viaJobId` is the pipeline it is opened from (a person still to reconfirm is visible only there). */
export const candidateUrl = (candidateId: string, viaJobId: string | null = null): string =>
  `/api/v1/candidates/${id(candidateId)}${viaJobId ? `?viaJobId=${id(viaJobId)}` : ''}`

/** Opening a profile is audited by the api (`candidate.viewed`). */
export const getCandidate = async (request: JobApiRequest, candidateId: string, viaJobId: string | null = null): Promise<CandidateDetailDto> =>
  (await callApi(request, candidateUrl(candidateId, viaJobId), candidateDetailSchema)).data

export const updateCandidateTags = async (request: JobApiRequest, candidateId: string, tags: readonly string[]): Promise<CandidateDetailDto> =>
  (await callApi(request, `/api/v1/candidates/${id(candidateId)}`, candidateDetailSchema, { method: 'PATCH', body: { tags } })).data

export const addNote = async (request: JobApiRequest, candidateId: string, body: string, applicationId: string | null): Promise<NoteDto> =>
  (await callApi(request, `/api/v1/candidates/${id(candidateId)}/notes`, noteSchema, { method: 'POST', body: { body, ...(applicationId ? { applicationId } : {}) } })).data

/** Same-origin address of the CV: `inline` for the preview, `attachment` for the download. Both are audited. */
export const cvUrl = (applicationId: string, disposition: 'inline' | 'attachment'): string => `/api/v1/applications/${id(applicationId)}/cv?disposition=${disposition}`
