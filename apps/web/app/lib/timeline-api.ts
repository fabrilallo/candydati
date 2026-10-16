import { applicationTimelineSchema, type ApplicationTimelineDto } from '@candydati/domain'
import { applicationTimelinePath } from './api-paths'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'

/** The timeline of one application, oldest first. `viaJobId` is the pipeline the profile is opened from. */
export const getApplicationTimeline = async (request: JobApiRequest, applicationId: string, viaJobId?: string | null): Promise<ApplicationTimelineDto> =>
  (await callApi(request, applicationTimelinePath(applicationId, viaJobId), applicationTimelineSchema)).data
