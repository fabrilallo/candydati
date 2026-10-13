import { z } from 'zod'
import { callApi } from './api-call'
import { jobSchema } from './job-api-schemas'
import type { JobApiRequest } from './job-api'
import {
  APPROVAL_SETTINGS_PATH,
  approvalSettingsSchema,
  approveJobRequestPath,
  convertJobRequestPath,
  JOB_REQUESTS_PATH,
  jobRequestPath,
  jobRequestSchema,
  rejectJobRequestPath,
  type JobRequestDto,
  type JobRequestInput,
} from './phase9-contract'

/** Job requests and the approval setting (phase 9 contract D, HTTP). */
export const listJobRequests = async (request: JobApiRequest): Promise<readonly JobRequestDto[]> => (await callApi(request, JOB_REQUESTS_PATH, z.array(jobRequestSchema))).data

export const getJobRequest = async (request: JobApiRequest, id: string): Promise<JobRequestDto> => (await callApi(request, jobRequestPath(id), jobRequestSchema)).data

export const createJobRequest = async (request: JobApiRequest, input: JobRequestInput): Promise<JobRequestDto> =>
  (await callApi(request, JOB_REQUESTS_PATH, jobRequestSchema, { method: 'POST', body: input })).data

/** The note is optional when approving, and sent only when written. */
export const approveJobRequest = async (request: JobApiRequest, id: string, note: string): Promise<JobRequestDto> =>
  (await callApi(request, approveJobRequestPath(id), jobRequestSchema, { method: 'POST', body: note.trim() === '' ? {} : { note: note.trim() } })).data

export const rejectJobRequest = async (request: JobApiRequest, id: string, note: string): Promise<JobRequestDto> =>
  (await callApi(request, rejectJobRequestPath(id), jobRequestSchema, { method: 'POST', body: { note: note.trim() } })).data

/** Creates the draft job from an approved request and returns it. */
export const convertJobRequest = async (request: JobApiRequest, id: string) =>
  (await callApi(request, convertJobRequestPath(id), jobSchema, { method: 'POST' })).data

export const getApprovalSetting = async (request: JobApiRequest): Promise<boolean> => (await callApi(request, APPROVAL_SETTINGS_PATH, approvalSettingsSchema)).data.requireApproval

export const setApprovalSetting = async (request: JobApiRequest, requireApproval: boolean): Promise<boolean> =>
  (await callApi(request, APPROVAL_SETTINGS_PATH, approvalSettingsSchema, { method: 'PUT', body: { requireApproval } })).data.requireApproval
