import { z } from 'zod';
import type { DistributionDeps } from '../../distribution-ports.js';
import { defineUseCase } from '../../use-case.js';
import { syncChannels, type SyncSummary } from './sync-channels.js';

const inputSchema = z.object({ organizationId: z.string().min(1), jobId: z.string().min(1) });

export type DistributionSkipReason = 'job_not_found' | 'organization_not_found';

export interface DistributionSyncResult extends SyncSummary {
  readonly skipped: DistributionSkipReason | null;
}

/**
 * Worker use case (system actor, task `distribution.sync`): reacts to `job.published`, `job.updated` and `job.closed` by
 * syncing every registered channel with the job as it is NOW (the event only says which job). Status per channel lands in
 * `job_distribution`. Failures do not throw: the caller reads `failed` and decides to retry. Safe to repeat. With the
 * empty registry of the self-hosted default it is a no-op that records nothing.
 */
export const runDistributionSync = defineUseCase<DistributionDeps, typeof inputSchema, DistributionSyncResult>({
  name: 'runDistributionSync',
  input: inputSchema,
  organizationOf: (input) => input.organizationId,
  permission: { skip: 'system job enqueued after a job event; the organization scope still applies' },
  audit: { skip: 'the outcome per channel is stored in job_distribution; the manual re-sync is audited as job.distribution_synced' },
  handler: async ({ deps, input }): Promise<DistributionSyncResult> => {
    const none = { published: 0, removed: 0, failed: 0 };
    if (deps.registry.list().length === 0) return { ...none, skipped: null };
    const job = await deps.jobs.findById(input.organizationId, input.jobId);
    if (!job) return { ...none, skipped: 'job_not_found' };
    const organization = await deps.organizations.findById(input.organizationId);
    if (!organization) return { ...none, skipped: 'organization_not_found' };
    return { ...(await syncChannels(deps, job, organization)), skipped: null };
  },
});
