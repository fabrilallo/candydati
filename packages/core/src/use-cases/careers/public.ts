import { defaultCareersPage, visibleSections, type PublicCareersPageDto } from '@candydati/domain';
import { z } from 'zod';
import { mediaFileInput, openMediaFile, type CareersMediaFile } from './media-file.js';
import { NotFoundError } from '../../errors.js';
import { toPublicOrganizationDto } from '../../mappers/job-dto.js';
import { definePublicCareersQuery } from './define.js';
import { logoMediaIdOf } from './logo.js';
import { mediaMapOf, referencedIds } from './shared.js';

const slugInput = z.object({ organizationSlug: z.string().min(1).max(200) });

/**
 * The published careers page: visible sections only, and the media they use. An organization that never published gets
 * the default page (its name and the open positions), so every careers page works from day one.
 */
export const getPublicCareersPage = definePublicCareersQuery({
  name: 'getPublicCareersPage',
  input: slugInput,
  handler: async ({ deps, input }): Promise<PublicCareersPageDto> => {
    const organization = await deps.organizations.findBySlug(input.organizationSlug);
    if (!organization) throw new NotFoundError('Organization not found.');
    const record = await deps.careersPages.find(organization.id);
    const page = visibleSections(record?.published ?? defaultCareersPage(organization.name, deps.defaultLocale));
    return {
      organization: toPublicOrganizationDto(organization),
      page,
      media: await mediaMapOf(deps, organization, page),
      publishedAt: record?.publishedAt?.toISOString() ?? null,
    };
  },
});

/**
 * One stored file of the PUBLISHED page, for visitors: only media a visible section of the published page uses, and the
 * organization's logo (shown on the page and every ad). Drafts, hidden sections and the rest of the library go through the editor's own route (`getCareersMediaFile`), never here,
 * so nothing unpublished becomes reachable or lands in a shared cache.
 */
export const getPublicCareersMedia = definePublicCareersQuery({
  name: 'getPublicCareersMedia',
  input: slugInput.extend(mediaFileInput),
  handler: async ({ deps, input }): Promise<CareersMediaFile> => {
    const organization = await deps.organizations.findBySlug(input.organizationSlug);
    if (!organization) throw new NotFoundError('Not found.');
    const published = (await deps.careersPages.find(organization.id))?.published ?? null;
    const visible = published ? referencedIds(visibleSections(published)) : new Set<string>();
    if (!visible.has(input.mediaId) && (await logoMediaIdOf(deps, organization.id)) !== input.mediaId) throw new NotFoundError('Not found.');
    return openMediaFile(deps, await deps.careersMedia.findById(organization.id, input.mediaId), input.fileName, input.range);
  },
});

export { isRangeNotSatisfiable, unsatisfiedRangeSize, type CareersMediaFile } from './media-file.js';
