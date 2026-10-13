import type { CandidateCorrection, ConsentScope, DataExportStatus } from '@tt/domain'
import { z } from 'zod'
import { ApiFailure, callApi } from './api-call'
import { candidateDetailSchema, type CandidateDetailDto } from './candidate-schemas'
import type { JobApiRequest } from './job-api'
import {
  dataExportCreatedSchema,
  dataExportSchema,
  erasedSchema,
  processingRecordSchema,
  retentionOverviewSchema,
  type DataExportDto,
  type ProcessingRecordDto,
  type RetentionOverviewDto,
} from './phase5-contract'

/** Candidate rights, retention and organization exports (phase 5 contract, "HTTP"). */
const id = (value: string): string => encodeURIComponent(value)

/** Same-origin address of the candidate's ZIP (audited `candidate.exported`); downloaded by the browser, not parsed. */
export const candidateExportUrl = (candidateId: string): string => `/api/v1/candidates/${id(candidateId)}/export`
/** Same-origin address of a ready organization export (audited `organization.exported`). */
export const dataExportUrl = (exportId: string): string => `/api/v1/exports/${id(exportId)}/download`

export const correctCandidate = async (request: JobApiRequest, candidateId: string, input: CandidateCorrection): Promise<CandidateDetailDto> =>
  (await callApi(request, `/api/v1/candidates/${id(candidateId)}/details`, candidateDetailSchema, { method: 'PATCH', body: input })).data

/** The email belongs to another candidate of the organization (contract: 409). */
export const isEmailConflict = (error: unknown): boolean => error instanceof ApiFailure && (error.failure.status === 409 || error.failure.code === 'email_taken')

export const eraseCandidate = async (request: JobApiRequest, candidateId: string, confirmName: string): Promise<void> => {
  await callApi(request, `/api/v1/candidates/${id(candidateId)}/erase`, erasedSchema, { method: 'POST', body: { confirmName } })
}

export const eraseApplication = async (request: JobApiRequest, applicationId: string, confirmName: string): Promise<void> => {
  await callApi(request, `/api/v1/applications/${id(applicationId)}/erase`, erasedSchema, { method: 'POST', body: { confirmName } })
}

export type WithdrawResult = { readonly erased: true } | { readonly erased: false; readonly detail: CandidateDetailDto }

const withdrawSchema = z.union([erasedSchema, candidateDetailSchema.transform((detail) => ({ erased: false as const, detail }))])

/** Talent pool: the fresh detail comes back. Selection: the application is erased (`{ erased: true }`). */
export const withdrawConsent = async (request: JobApiRequest, applicationId: string, scope: ConsentScope): Promise<WithdrawResult> =>
  (await callApi(request, `/api/v1/applications/${id(applicationId)}/withdraw-consent`, withdrawSchema, { method: 'POST', body: { scope } })).data

export const getRetentionOverview = async (request: JobApiRequest): Promise<RetentionOverviewDto> => (await callApi(request, '/api/v1/privacy/retention', retentionOverviewSchema)).data

export const listDataExports = async (request: JobApiRequest): Promise<readonly DataExportDto[]> => (await callApi(request, '/api/v1/exports', z.array(dataExportSchema))).data

export const createDataExport = async (request: JobApiRequest): Promise<{ readonly id: string; readonly status: DataExportStatus }> =>
  (await callApi(request, '/api/v1/exports', dataExportCreatedSchema, { method: 'POST', body: {} })).data

export const getProcessingRecord = async (request: JobApiRequest): Promise<ProcessingRecordDto> => (await callApi(request, '/api/v1/privacy/processing-record', processingRecordSchema)).data
