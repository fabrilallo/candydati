import type { PublicJobPageDto } from '@tt/domain';
import { z } from 'zod';
import { NotFoundError } from '../../errors.js';
import { toPublicJobDto, toPublicOrganizationDto } from '../../mappers/job-dto.js';
import { definePublicJobQuery } from './define.js';

/** One published job. Drafts, closed jobs and jobs of other organizations are all "not found". */
export const getPublicJob = definePublicJobQuery({
  name: 'getPublicJob',
  input: z.object({ organizationSlug: z.string().min(1), jobSlug: z.string().min(1) }),
  handler: async ({ deps, input }): Promise<PublicJobPageDto> => {
    const organization = await deps.organizations.findBySlug(input.organizationSlug);
    if (!organization) throw new NotFoundError('Organization not found.');
    const job = await deps.jobs.findPublishedBySlug(organization.id, input.jobSlug);
    if (!job) throw new NotFoundError('Job not found.');
    return { organization: toPublicOrganizationDto(organization), job: toPublicJobDto(job) };
  },
});
