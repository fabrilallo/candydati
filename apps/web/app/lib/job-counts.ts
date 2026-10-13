import { JOB_STATUSES, type JobStatus } from '@tt/domain'
import { listJobs, type JobApiRequest } from './job-api'

/** How many jobs the organization has per status, plus the total. Real numbers only, read from the jobs api. */
export type JobCounts = Readonly<Record<JobStatus, number>> & { readonly total: number }

/** One request per status for a one-item page: the page meta carries the total. Rejects if any status fails. */
export const loadJobCounts = async (request: JobApiRequest): Promise<JobCounts> => {
  const totals = await Promise.all(JOB_STATUSES.map(async (status) => [status, (await listJobs(request, status, 1, 1)).meta.total] as const))
  const byStatus = Object.fromEntries(totals) as Record<JobStatus, number>
  return { ...byStatus, total: totals.reduce((sum, [, count]) => sum + count, 0) }
}

