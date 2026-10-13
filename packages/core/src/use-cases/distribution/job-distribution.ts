import type { JobDistributionDto, Job } from '@tt/domain';
import { z } from 'zod';
import type { DistributionDeps } from '../../distribution-ports.js';
import type { PublicOrganization } from '../../job-ports.js';
import { feedDistributionDto, toJobDistributionDto } from '../../mappers/distribution-dto.js';
import { requireJob } from '../jobs/shared.js';
import { defineDistributionUseCase } from './define.js';
import { requireOrganization } from './organization.js';
import { syncChannels, type SyncSummary } from './sync-channels.js';

const inputSchema = z.object({ jobId: z.string().min(1) });

/** Feed row first, then each registered channel that is on or has a history for this job. */
async function distributionRows(deps: DistributionDeps, job: Job, organization: PublicOrganization): Promise<readonly JobDistributionDto[]> {
  const rows = await deps.distributions.listByJob(job.organizationId, job.id);
  const settings = await deps.distributionSettings.list(job.organizationId);
  const channels = deps.registry.list().flatMap((channel) => {
    const row = rows.find((candidate) => candidate.channelId === channel.id);
    if (row) return [toJobDistributionDto(channel, row)];
    const enabled = settings.find((setting) => setting.channelId === channel.id)?.enabled ?? true;
    // Not synced yet: a published ad waits for the worker; a draft or closed one is simply not there.
    return enabled && job.status === 'published' ? [{ channelId: channel.id, label: channel.label, status: 'pending' as const, url: null, error: null, updatedAt: null }] : [];
  });
  return [feedDistributionDto(job, organization, deps.publicBaseUrl), ...channels];
}

/** Where an ad is: the XML feed (computed) and every registered channel, with status, link and last error. */
export const getJobDistribution = defineDistributionUseCase({
  name: 'getJobDistribution',
  input: inputSchema,
  permission: 'job:read',
  audit: { skip: 'read-only' },
  handler: async ({ deps, actor, input }): Promise<readonly JobDistributionDto[]> =>
    distributionRows(deps, await requireJob(deps, actor.organizationId, input.jobId), await requireOrganization(deps, actor.organizationId)),
});

export interface SyncJobDistributionResult {
  readonly summary: SyncSummary;
  readonly distribution: readonly JobDistributionDto[];
}

/** Re-sends the ad to every enabled channel right now and answers with the new statuses (a failing channel shows as `failed`). */
export const syncJobDistribution = defineDistributionUseCase({
  name: 'syncJobDistribution',
  input: inputSchema,
  permission: 'job:publish',
  audit: {
    action: 'job.distribution_synced',
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (_input, result: SyncJobDistributionResult) => ({ ...result.summary }),
  },
  handler: async ({ deps, actor, input }): Promise<SyncJobDistributionResult> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    const organization = await requireOrganization(deps, actor.organizationId);
    const summary = await syncChannels(deps, job, organization);
    return { summary, distribution: await distributionRows(deps, job, organization) };
  },
});
