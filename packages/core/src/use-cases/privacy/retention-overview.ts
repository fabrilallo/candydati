import { RETENTION_WARNING_DAYS, type RetentionRun } from '@tt/domain';
import { z } from 'zod';
import type { PrivacyOverviewDeps, ConfiguredProviders } from '../../privacy-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';
import { loadRefs } from '../refs.js';
import { sequential } from '../../sequential.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_MAX = 200;
const RUNS_SHOWN = 10;

const defineOverviewUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<PrivacyOverviewDeps, S, O>): UseCase<PrivacyOverviewDeps, O> =>
  defineUseCase<PrivacyOverviewDeps, S, O>(definition);

export interface UpcomingExpiry {
  readonly applicationId: string;
  readonly candidateId: string;
  readonly candidateName: string;
  readonly jobTitle: string | null;
  readonly retentionExpiresAt: Date;
}

export interface RetentionOverview {
  /** Applications expiring within the warning period (or already past, until the next run erases them), earliest first. */
  readonly upcoming: readonly UpcomingExpiry[];
  readonly lastRuns: readonly RetentionRun[];
}

/** What the retention job will erase soon and what it did lately. The controller's settings: owner and admin. */
export const getRetentionOverview = defineOverviewUseCase({
  name: 'getRetentionOverview',
  input: z.object({}),
  permission: 'privacy:manage',
  audit: { skip: 'read-only overview inside the app; the candidate profiles it points to are audited when opened' },
  handler: async ({ deps, actor }): Promise<RetentionOverview> => {
    const organizationId = actor.organizationId;
    const before = new Date(deps.now().getTime() + RETENTION_WARNING_DAYS * DAY_MS);
    const applications = (await deps.applications.listRetentionExpiringBefore(organizationId, before)).slice(0, UPCOMING_MAX);
    const refs = await loadRefs(deps, organizationId, applications.map((a) => a.id), applications.map((a) => a.jobId));
    const upcoming = applications.flatMap((application): UpcomingExpiry[] => {
      const candidate = refs.candidateOf(application.id);
      if (!candidate) return [];
      return [
        {
          applicationId: application.id,
          candidateId: candidate.id,
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          jobTitle: refs.jobTitleOf(application.jobId),
          retentionExpiresAt: application.retentionExpiresAt,
        },
      ];
    });
    return { upcoming, lastRuns: await deps.retentionRuns.listRecent(organizationId, RUNS_SHOWN) };
  },
});

export interface ProcessingRecord {
  readonly organizationName: string;
  /** From the active privacy notice; null until one is published. */
  readonly contactEmail: string | null;
  readonly noticeVersion: number | null;
  readonly retentionDays: { readonly selection: number; readonly talent_pool: number } | null;
  readonly providers: ConfiguredProviders;
}

/** The data for the registro dei trattamenti (art. 30), filled from the organization's settings and the instance config. */
export const getProcessingRecord = defineOverviewUseCase({
  name: 'getProcessingRecord',
  input: z.object({}),
  permission: 'privacy:manage',
  audit: { skip: 'read-only, organization settings and instance configuration' },
  handler: async ({ deps, actor }): Promise<ProcessingRecord> => {
    const [organization, notice] = await sequential(() => deps.organizations.findById(actor.organizationId), () => deps.privacyNotices.findActive(actor.organizationId));
    return {
      organizationName: organization?.name ?? '',
      contactEmail: notice?.contactEmail ?? null,
      noticeVersion: notice?.version ?? null,
      retentionDays: notice ? { ...notice.retentionDays } : null,
      providers: deps.providers,
    };
  },
});
