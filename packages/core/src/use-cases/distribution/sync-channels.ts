import { DISTRIBUTION_ERROR_MAX, type Job, type JobDistribution } from '@candydati/domain';
import type { DistributionChannel, DistributionDeps } from '../../distribution-ports.js';
import type { PublicOrganization } from '../../job-ports.js';
import { toDistributionJobView } from '../../mappers/distribution-dto.js';

export interface SyncSummary {
  /** Channels that now hold the ad. */
  readonly published: number;
  /** Channels the ad was taken down from. */
  readonly removed: number;
  readonly failed: number;
}

/** What a person may read about a failure: one short line, no internals beyond the channel's own message. */
const failureReason = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/\s+/g, ' ').trim().slice(0, DISTRIBUTION_ERROR_MAX) || 'channel_error';
};

type Outcome = 'published' | 'removed' | 'failed' | 'unchanged';

async function publishOn(deps: DistributionDeps, channel: DistributionChannel, job: Job, organization: PublicOrganization, existing: JobDistribution | null): Promise<JobDistribution> {
  const view = toDistributionJobView(job, organization, deps.publicBaseUrl);
  // A failed update keeps its externalId: the ad is on the board, so the retry updates it and never publishes a second one.
  const known = existing?.externalId ? existing : null;
  const result = known ? await channel.update(view, organization, { externalId: known.externalId, url: known.url }) : await channel.publish(view, organization);
  return {
    organizationId: job.organizationId,
    jobId: job.id,
    channelId: channel.id,
    status: 'published',
    externalId: result.externalId ?? existing?.externalId ?? null,
    url: result.url ?? existing?.url ?? null,
    error: null,
    updatedAt: deps.now(),
  };
}

async function removeFrom(deps: DistributionDeps, channel: DistributionChannel, job: Job, organization: PublicOrganization, existing: JobDistribution): Promise<JobDistribution> {
  // A channel that never took the ad has nothing to remove.
  if (existing.status === 'published' || existing.externalId !== null) {
    await channel.remove({ jobId: job.id, slug: job.slug, externalId: existing.externalId, url: existing.url }, organization);
  }
  return { ...existing, status: 'removed', error: null, updatedAt: deps.now() };
}

async function syncChannel(deps: DistributionDeps, channel: DistributionChannel, job: Job, organization: PublicOrganization, enabled: boolean): Promise<Outcome> {
  const existing = await deps.distributions.find(job.organizationId, job.id, channel.id);
  const wanted = job.status === 'published' && enabled;
  if (!wanted && (existing === null || existing.status === 'removed')) return 'unchanged';
  try {
    const next = wanted ? await publishOn(deps, channel, job, organization, existing) : await removeFrom(deps, channel, job, organization, existing!);
    await deps.distributions.save(next);
    return wanted ? 'published' : 'removed';
  } catch (error) {
    await deps.distributions.save({
      organizationId: job.organizationId,
      jobId: job.id,
      channelId: channel.id,
      status: 'failed',
      externalId: existing?.externalId ?? null,
      url: existing?.url ?? null,
      error: failureReason(error),
      updatedAt: deps.now(),
    });
    return 'failed';
  }
}

/**
 * Brings every registered channel in line with the job: a published job goes (or is updated) on each enabled channel, a
 * closed or disabled one is taken down where it was. A failing channel is recorded as `failed` and never stops the
 * others. With an empty registry there is nothing to do and nothing is written.
 */
export async function syncChannels(deps: DistributionDeps, job: Job, organization: PublicOrganization): Promise<SyncSummary> {
  const channels = deps.registry.list();
  if (channels.length === 0) return { published: 0, removed: 0, failed: 0 };
  const settings = await deps.distributionSettings.list(job.organizationId);
  const outcomes: Outcome[] = [];
  for (const channel of channels) {
    const enabled = settings.find((setting) => setting.channelId === channel.id)?.enabled ?? true;
    outcomes.push(await syncChannel(deps, channel, job, organization, enabled));
  }
  const count = (outcome: Outcome) => outcomes.filter((value) => value === outcome).length;
  return { published: count('published'), removed: count('removed'), failed: count('failed') };
}
