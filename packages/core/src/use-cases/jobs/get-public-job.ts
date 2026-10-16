import type { PublicJobPageDto } from '@candydati/domain';
import { toPublicPrivacyNoticeDto, type PublicPrivacyNoticeDto } from '../../mappers/candidate-dto.js';
import { z } from 'zod';
import { NotFoundError } from '../../errors.js';
import { toPublicJobDto, toPublicOrganizationDto } from '../../mappers/job-dto.js';
import { definePublicJobQuery } from './define.js';

/** The public page plus the notice the candidate must read before applying (null: the form cannot be shown). */
export interface PublicJobPage extends PublicJobPageDto {
  readonly privacyNotice: PublicPrivacyNoticeDto | null;
}

/** One published job. Drafts, closed jobs and jobs of other organizations are all "not found". */
export const getPublicJob = definePublicJobQuery({
  name: 'getPublicJob',
  input: z.object({ organizationSlug: z.string().min(1), jobSlug: z.string().min(1) }),
  handler: async ({ deps, input }): Promise<PublicJobPage> => {
    const organization = await deps.organizations.findBySlug(input.organizationSlug);
    if (!organization) throw new NotFoundError('Organization not found.');
    const job = await deps.jobs.findPublishedBySlug(organization.id, input.jobSlug);
    if (!job) throw new NotFoundError('Job not found.');
    const notice = await deps.privacyNotices.findActive(organization.id);
    return {
      organization: toPublicOrganizationDto(organization),
      job: toPublicJobDto(job),
      privacyNotice: notice ? toPublicPrivacyNoticeDto(notice) : null,
    };
  },
});
