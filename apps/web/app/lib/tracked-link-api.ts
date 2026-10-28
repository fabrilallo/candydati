import { savedTrackedLinkSchema, trackedLinksSchema, type SavedTrackedLinkDto, type TrackedLinkDto } from '@candydati/domain'
import { z } from 'zod'
import { callApi } from './api-call'
import { trackedLinkPath, trackedLinksPath } from './api-paths'
import type { JobApiRequest } from './job-api'

export type { SavedTrackedLinkDto, TrackedLinkDto }

/** Tracked links saved on a job (`job:publish`): one per channel and campaign, oldest first. */
export const listTrackedLinks = async (request: JobApiRequest, jobId: string): Promise<readonly TrackedLinkDto[]> =>
  (await callApi(request, trackedLinksPath(jobId), trackedLinksSchema)).data

/** Saves a channel and campaign; the same pair again answers with the link already saved (`created: false`). */
export const saveTrackedLink = async (request: JobApiRequest, jobId: string, link: { readonly source: string; readonly campaign: string }): Promise<SavedTrackedLinkDto> =>
  (await callApi(request, trackedLinksPath(jobId), savedTrackedLinkSchema, { method: 'POST', body: { source: link.source, campaign: link.campaign } })).data

export const removeTrackedLink = async (request: JobApiRequest, jobId: string, linkId: string): Promise<void> => {
  await callApi(request, trackedLinkPath(jobId, linkId), z.object({ removed: z.literal(true) }), { method: 'DELETE' })
}
