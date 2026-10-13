import type { JobStatus } from '@tt/domain'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'
import { REPORTS_CSV_PATH, REPORTS_PATH, reportsSchema, type ReportsView } from './phase10-contract'
import { reportsQuery, type Period } from './report-period'

/** Aggregates of the period (and job), validated section by section: an invalid section is `null`, never a zero. */
export const getReports = async (request: JobApiRequest, period: Period, jobId: string | null): Promise<ReportsView> =>
  (await callApi(request, `${REPORTS_PATH}?${reportsQuery(period, jobId)}`, reportsSchema)).data

/** Same-origin link to the CSV of the same figures; the session cookie goes with it. */
export const reportsCsvUrl = (period: Period, jobId: string | null): string => `${REPORTS_CSV_PATH}?${reportsQuery(period, jobId)}`

export interface ReportJobOption {
  readonly id: string
  readonly title: string
}

/** The job filter: ads that were published at some point (drafts have no applications), by title. */
export const reportJobOptions = (jobs: readonly { readonly id: string; readonly title: string; readonly status: JobStatus }[]): readonly ReportJobOption[] =>
  jobs
    .filter((job) => job.status !== 'draft')
    .map((job) => ({ id: job.id, title: job.title }))
    .toSorted((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
