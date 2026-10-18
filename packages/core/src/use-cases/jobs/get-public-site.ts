import { careersUrl, feedUrl, type PublicFeedDto, type PublicOrganizationSummaryDto } from '@candydati/domain';
import { z } from 'zod';
import { NotFoundError } from '../../errors.js';
import type { PublicSiteDeps } from '../../distribution-ports.js';
import { toPublicJobDto, toPublicOrganizationDto } from '../../mappers/job-dto.js';
import { definePublicQuery } from '../../use-case.js';

const input = z.object({ organizationSlug: z.string().min(1) });

/** Name, logo, where the careers page and the feed are, and how many ads are open. No ids of people. */
export const getPublicOrganizationSummary = definePublicQuery<PublicSiteDeps, typeof input, PublicOrganizationSummaryDto>({
  name: 'getPublicOrganizationSummary',
  input,
  handler: async ({ deps, input: { organizationSlug } }) => {
    const organization = await deps.organizations.findBySlug(organizationSlug);
    if (!organization) throw new NotFoundError('Organization not found.');
    const counts = await deps.jobs.countByStatus(organization.id);
    const dto = toPublicOrganizationDto(organization);
    return {
      ...dto,
      // A library logo is a same-origin path: the sites that embed this summary need the whole address.
      logo: dto.logo?.startsWith('/') ? `${deps.publicBaseUrl.replace(/\/$/, '')}${dto.logo}` : dto.logo,
      careersUrl: careersUrl(deps.publicBaseUrl, organization.slug),
      feedUrl: feedUrl(deps.publicBaseUrl, organization.slug),
      openPositions: counts.published,
    };
  },
});

/** The full content of every published ad: what the XML feed, `llms.txt` and the sitemap are built from. */
export const getPublicFeed = definePublicQuery<Pick<PublicSiteDeps, 'jobs' | 'organizations'>, typeof input, PublicFeedDto>({
  name: 'getPublicFeed',
  input,
  handler: async ({ deps, input: { organizationSlug } }) => {
    const organization = await deps.organizations.findBySlug(organizationSlug);
    if (!organization) throw new NotFoundError('Organization not found.');
    const jobs = await deps.jobs.listPublished(organization.id);
    return { organization: toPublicOrganizationDto(organization), jobs: jobs.map(toPublicJobDto) };
  },
});
