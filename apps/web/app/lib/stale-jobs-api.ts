import { z } from 'zod'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'
import { staleJobSchema, type StaleJobDto } from '@candydati/domain'
import { STALE_JOBS_PATH } from './api-paths'

/** The published ads without activity for `STALE_JOB_DAYS` days, most idle first. Read only: an ad is never closed here. */
export const listStaleJobs = async (request: JobApiRequest): Promise<readonly StaleJobDto[]> =>
  (await callApi(request, STALE_JOBS_PATH, z.array(staleJobSchema))).data

/** Pure: the days without activity of each stale ad, by id. */
export const staleDaysById = (jobs: readonly StaleJobDto[]): ReadonlyMap<string, number> =>
  new Map(jobs.map((item) => [item.job.id, item.daysIdle]))
