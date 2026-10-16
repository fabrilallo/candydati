import { z } from 'zod';
import { toPublicJobSummaryDto, toPublicOrganizationDto } from '../../mappers/job-dto.js';
import { NotFoundError } from '../../errors.js';
import { definePublicJobQuery } from './define.js';
import type { PublicCareersDto } from '@candydati/domain';

/** The careers page of an organization: published jobs only, newest first. */
export const getPublicCareers = definePublicJobQuery({
  name: 'getPublicCareers',
  input: z.object({ organizationSlug: z.string().min(1) }),
  handler: async ({ deps, input }): Promise<PublicCareersDto> => {
    const organization = await deps.organizations.findBySlug(input.organizationSlug);
    if (!organization) throw new NotFoundError('Organization not found.');
    const jobs = await deps.jobs.listPublished(organization.id);
    return { organization: toPublicOrganizationDto(organization), jobs: jobs.map(toPublicJobSummaryDto) };
  },
});
