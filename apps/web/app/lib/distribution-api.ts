import { z } from 'zod'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'
import {
  channelSettingPath,
  channelSettingSchema,
  DISTRIBUTION_PATH,
  distributionOverviewSchema,
  jobDistributionListPath,
  jobDistributionSchema,
  jobDistributionSyncPath,
  type ChannelSettingDto,
  type DistributionOverviewDto,
  type JobChannelDto,
} from './phase7-contract'

/** Distribution (phase 7): the status of one job per channel, a new sync, and the organization's channel toggles. */
export const listJobChannels = async (request: JobApiRequest, jobId: string): Promise<readonly JobChannelDto[]> =>
  (await callApi(request, jobDistributionListPath(jobId), jobDistributionSchema)).data

/** `job:publish`: answers with the fresh rows, or nothing the web needs (it reloads either way). */
export const syncJobChannels = async (request: JobApiRequest, jobId: string): Promise<void> => {
  await callApi(request, jobDistributionSyncPath(jobId), z.unknown(), { method: 'POST', body: {} })
}

export const getDistribution = async (request: JobApiRequest): Promise<DistributionOverviewDto> =>
  (await callApi(request, DISTRIBUTION_PATH, distributionOverviewSchema)).data

export const setChannelEnabled = async (request: JobApiRequest, channelId: string, enabled: boolean): Promise<ChannelSettingDto> =>
  (await callApi(request, channelSettingPath(channelId), channelSettingSchema, { method: 'PUT', body: { enabled } })).data
