import { jobTrafficSchema, type JobTrafficDto } from '@candydati/domain'
import { callApi } from './api-call'
import { jobTrafficPath } from './api-paths'
import type { JobApiRequest } from './job-api'
import { trafficQuery, type TrafficPeriod } from './traffic-view'

export type { JobTrafficDto }

/** Visits and applications of one ad per UTC day, source and campaign (`report:read`). Counts only. */
export const getJobTraffic = async (request: JobApiRequest, jobId: string, period: TrafficPeriod): Promise<JobTrafficDto> =>
  (await callApi(request, `${jobTrafficPath(jobId)}?${trafficQuery(period)}`, jobTrafficSchema)).data
