import { z } from 'zod'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'
import { STALE_JOBS_PATH, staleJobSchema, type StaleJobDto } from './phase9-contract'

/** The published ads without activity for `STALE_JOB_DAYS` days, most idle first. Read only: an ad is never closed here. */
export const listStaleJobs = async (request: JobApiRequest): Promise<readonly StaleJobDto[]> =>
  (await callApi(request, STALE_JOBS_PATH, z.array(staleJobSchema))).data

/** Pure: the ids of the stale ads, to tell at a glance which rows of a list are stale. */
export const staleIdSet = (jobs: readonly StaleJobDto[]): ReadonlySet<string> => new Set(jobs.map((job) => job.id))

/** Pure: the days without activity of each stale ad, by id. */
export const staleDaysById = (jobs: readonly StaleJobDto[]): ReadonlyMap<string, number> =>
  new Map(jobs.map((job) => [job.id, job.daysSinceActivity]))
