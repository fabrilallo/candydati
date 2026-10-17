import type { SetupProgressDto } from '@candydati/domain';
import { z } from 'zod';
import type { MemberDirectory } from '../../automation-ports.js';
import type { PrivacyNoticeRepository } from '../../candidate-ports.js';
import type { CareersPageRepository } from '../../careers-ports.js';
import type { JobRepository } from '../../job-ports.js';
import type { CoreDeps } from '../../ports.js';
import { sequential } from '../../sequential.js';
import { defineUseCase } from '../../use-case.js';

/**
 * Narrow ports on purpose: job counts, never a job (per-job access is not involved), the active notice, the careers
 * page record and the member list, of which only the length is used.
 */
export interface SetupProgressDeps extends CoreDeps {
  readonly privacyNotices: Pick<PrivacyNoticeRepository, 'findActive'>;
  readonly careersPages: Pick<CareersPageRepository, 'find'>;
  readonly jobCounts: Pick<JobRepository, 'countByStatus'>;
  readonly members: MemberDirectory;
}

/** The setup checklist of the organization: yes or no per step, read from the real state, for every member. */
export const getSetupProgress = defineUseCase<SetupProgressDeps, z.ZodObject<Record<string, never>>, SetupProgressDto>({
  name: 'getSetupProgress',
  input: z.object({}),
  permission: { skip: 'every member sees how far the organization is set up: yes or no per step, no personal data' },
  audit: { skip: 'read of organization setup state, no personal data' },
  handler: async ({ deps, actor }) => {
    const organizationId = actor.organizationId;
    const [notice, page, counts, members] = await sequential(
      () => deps.privacyNotices.findActive(organizationId),
      () => deps.careersPages.find(organizationId),
      () => deps.jobCounts.countByStatus(organizationId),
      () => deps.members.list(organizationId),
    );
    return {
      privacyNotice: notice !== null,
      careersPage: (page?.publishedAt ?? null) !== null,
      jobCreated: counts.draft + counts.published + counts.closed > 0,
      jobPublished: counts.published + counts.closed > 0,
      team: members.length > 1,
    };
  },
});
