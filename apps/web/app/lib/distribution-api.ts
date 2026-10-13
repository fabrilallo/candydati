import { z } from 'zod'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'
import { channelSettingSchema, distributionOverviewSchema, jobDistributionSchema, type DistributionChannelDto, type DistributionOverviewDto, type JobDistributionDto } from '@tt/domain'
import { channelSettingPath, DISTRIBUTION_PATH, jobDistributionPath, jobDistributionSyncPath } from './api-paths'

/** Distribution (phase 7): the status of one job per channel, a new sync, and the organization's channel toggles. */
export const listJobChannels = async (request: JobApiRequest, jobId: string): Promise<readonly JobDistributionDto[]> =>
  (await callApi(request, jobDistributionPath(jobId), jobDistributionSchema)).data

/** `job:publish`: answers with the fresh rows, or nothing the web needs (it reloads either way). */
export const syncJobChannels = async (request: JobApiRequest, jobId: string): Promise<void> => {
  await callApi(request, jobDistributionSyncPath(jobId), z.unknown(), { method: 'POST', body: {} })
}

export const getDistribution = async (request: JobApiRequest): Promise<DistributionOverviewDto> =>
  (await callApi(request, DISTRIBUTION_PATH, distributionOverviewSchema)).data

export const setChannelEnabled = async (request: JobApiRequest, channelId: string, enabled: boolean): Promise<DistributionChannelDto> =>
  (await callApi(request, channelSettingPath(channelId), channelSettingSchema, { method: 'PUT', body: { enabled } })).data
