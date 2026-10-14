import { daysSince, staleCutoff, STALE_JOB_DAYS, type Job } from '@tt/domain';
import { z } from 'zod';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';
import type { StaleJobDeps } from '../../job-request-ports.js';

export interface StaleJobView {
  readonly job: Job;
  readonly lastActivityAt: Date;
  readonly daysIdle: number;
}

const defineStaleUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<StaleJobDeps, S, O>): UseCase<StaleJobDeps, O> =>
  defineUseCase<StaleJobDeps, S, O>(definition);

/**
 * Published ads with no activity for 90 days (`STALE_JOB_DAYS`), the longest idle first: the "Annunci fermi" tab. They are
 * only listed: nothing here, or anywhere, closes an ad automatically.
 */
export const listStaleJobs = defineStaleUseCase({
  name: 'listStaleJobs',
  input: z.object({}),
  permission: 'job:read',
  audit: { skip: 'read-only list, no candidate data' },
  handler: async ({ deps, actor }): Promise<readonly StaleJobView[]> => {
    const now = deps.now();
    const stale = await deps.staleJobs.listStale(staleCutoff(now), actor.organizationId);
    return stale.map(({ job, lastActivityAt }) => ({ job, lastActivityAt, daysIdle: Math.max(daysSince(lastActivityAt, now), STALE_JOB_DAYS) }));
  },
});
