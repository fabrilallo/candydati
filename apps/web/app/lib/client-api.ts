import {
  agencySettingSchema,
  clientSchema,
  jobClientSchema,
  publicShortlistCandidateSchema,
  publicShortlistSchema,
  shortlistSchema,
  type AgencySettingDto,
  type ClientAnswer,
  type ClientDisplay,
  type ClientDto,
  type ClientInput,
  type JobClientDto,
  type PublicShortlistCandidateDto,
  type PublicShortlistDto,
  type ShortlistDto,
  type ShortlistInput,
} from '@candydati/domain'
import { z } from 'zod'
import { ApiFailure, callApi } from './api-call'
import {
  AGENCY_SETTINGS_PATH,
  CLIENTS_PATH,
  clientArchivedPath,
  clientPath,
  jobClientPath,
  jobShortlistsPath,
  publicShortlistAnswersPath,
  publicShortlistPath,
  revokeShortlistPath,
} from './api-paths'
import type { ApiCall, JobApiRequest } from './job-api'

/** Clients of an agency, the client of a job and shortlists over HTTP (PRODUCT.md §3.5). */
const put = (body: unknown): ApiCall => ({ method: 'PUT', body })
const post = (body: unknown): ApiCall => ({ method: 'POST', body })

export const getAgencySetting = async (request: JobApiRequest): Promise<AgencySettingDto> => (await callApi(request, AGENCY_SETTINGS_PATH, agencySettingSchema)).data

export const setAgencySetting = async (request: JobApiRequest, setting: AgencySettingDto): Promise<AgencySettingDto> =>
  (await callApi(request, AGENCY_SETTINGS_PATH, agencySettingSchema, put(setting))).data

export const listClients = async (request: JobApiRequest, includeArchived = false): Promise<readonly ClientDto[]> =>
  (await callApi(request, includeArchived ? `${CLIENTS_PATH}?includeArchived=true` : CLIENTS_PATH, z.array(clientSchema))).data

export const createClient = async (request: JobApiRequest, input: ClientInput): Promise<ClientDto> => (await callApi(request, CLIENTS_PATH, clientSchema, post(input))).data

export const updateClient = async (request: JobApiRequest, id: string, input: ClientInput): Promise<ClientDto> => (await callApi(request, clientPath(id), clientSchema, put(input))).data

export const setClientArchived = async (request: JobApiRequest, id: string, archived: boolean): Promise<ClientDto> =>
  (await callApi(request, clientArchivedPath(id), clientSchema, put({ archived }))).data

export const getJobClient = async (request: JobApiRequest, jobId: string): Promise<JobClientDto> => (await callApi(request, jobClientPath(jobId), jobClientSchema)).data

export const setJobClient = async (request: JobApiRequest, jobId: string, choice: { readonly clientId: string | null; readonly display: ClientDisplay }): Promise<JobClientDto> =>
  (await callApi(request, jobClientPath(jobId), jobClientSchema, put(choice))).data

export const listJobShortlists = async (request: JobApiRequest, jobId: string): Promise<readonly ShortlistDto[]> =>
  (await callApi(request, jobShortlistsPath(jobId), z.array(shortlistSchema))).data

/** What the composer sends: the job is in the path. */
export type ShortlistBody = Omit<ShortlistInput, 'jobId'>

export const sendShortlist = async (request: JobApiRequest, jobId: string, body: ShortlistBody): Promise<ShortlistDto> =>
  (await callApi(request, jobShortlistsPath(jobId), shortlistSchema, post(body))).data

export const revokeShortlist = async (request: JobApiRequest, id: string): Promise<ShortlistDto> => (await callApi(request, revokeShortlistPath(id), shortlistSchema, post({}))).data

export type PublicShortlistLoad = { readonly kind: 'ok'; readonly data: PublicShortlistDto } | { readonly kind: 'invalid' } | { readonly kind: 'unavailable' }

/** Pure: an unknown, expired or revoked link all read the same (404); anything else is "try again later". */
export const isInvalidLink = (error: unknown): boolean =>
  error instanceof ApiFailure && (error.failure.status === 404 || error.failure.status === 400 || error.failure.status === 410 || error.failure.code === 'not_found')

/** Never throws: the page shows the shortlist or why it cannot. */
export const loadPublicShortlist = async (request: JobApiRequest, token: string): Promise<PublicShortlistLoad> => {
  try {
    return { kind: 'ok', data: (await callApi(request, publicShortlistPath(token), publicShortlistSchema)).data }
  } catch (error) {
    if (isInvalidLink(error)) return { kind: 'invalid' }
    console.error('[shortlist] load failed', error instanceof Error ? error.message : error)
    return { kind: 'unavailable' }
  }
}

export interface ShortlistAnswer {
  readonly itemId: string
  readonly answer: ClientAnswer
  readonly reason: string
}

export const answerPublicShortlist = async (request: JobApiRequest, token: string, answer: ShortlistAnswer): Promise<PublicShortlistCandidateDto> =>
  (await callApi(request, publicShortlistAnswersPath(token), publicShortlistCandidateSchema, post(answer))).data
