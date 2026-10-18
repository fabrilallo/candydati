import { setOrganizationLogoSchema, type OrganizationLogoDto } from '@candydati/domain';
import { z } from 'zod';
import type { CareersDeps } from '../../careers-ports.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import { logoFileOf, logoUrlOf } from '../../mappers/logo.js';
import { defineCareersUseCase } from './define.js';
import { requireOrganizationById } from './shared.js';

/** The logo's source and the address it is shown from (a library image that is gone shows nothing). */
async function logoView(deps: Pick<CareersDeps, 'organizations' | 'organizationLogos' | 'careersMedia'>, organizationId: string): Promise<OrganizationLogoDto> {
  const organization = await requireOrganizationById(deps, organizationId);
  const source = await deps.organizationLogos.find(organizationId);
  const media = source?.kind === 'media' ? await deps.careersMedia.findById(organizationId, source.mediaId) : null;
  const url = logoUrlOf({ ...organization, logo: source?.kind === 'url' ? source.url : null, logoFile: media ? logoFileOf(media) : null });
  return { source, url };
}

/** The organization's logo. It is public on the careers page and every ad, so any member may read it. */
export const getOrganizationLogo = defineCareersUseCase({
  name: 'getOrganizationLogo',
  input: z.object({}),
  permission: { skip: 'the logo is public on the careers page and every ad: any member of the organization may read it' },
  audit: { skip: 'read of a public organization field' },
  handler: async ({ deps, actor }): Promise<OrganizationLogoDto> => logoView(deps, actor.organizationId),
});

/**
 * Sets the logo to an image of the careers library (shown at its smallest stored width, from the public media route) or
 * to an https address, or removes it. It changes at once on the careers page, the ads and the app: no draft.
 */
export const setOrganizationLogo = defineCareersUseCase({
  name: 'setOrganizationLogo',
  input: setOrganizationLogoSchema,
  permission: 'careers_page:manage',
  audit: {
    action: 'organization.logo_changed',
    target: (_input, _result, actor) => ({ type: 'organization', id: actor.organizationId }),
    metadata: (input) => ({ source: input.source?.kind ?? 'none' }),
  },
  handler: async ({ deps, actor, input }): Promise<OrganizationLogoDto> => {
    const { source } = input;
    if (source?.kind === 'media') {
      const media = await deps.careersMedia.findById(actor.organizationId, source.mediaId);
      if (!media) throw new NotFoundError('Media not found.');
      if (logoFileOf(media) === null) throw new ValidationError([{ path: 'source.mediaId', message: 'logo_not_image' }]);
    }
    await deps.organizationLogos.set(actor.organizationId, source);
    return logoView(deps, actor.organizationId);
  },
});

/** Id of the library image used as logo, or null. */
export const logoMediaIdOf = async (deps: Pick<CareersDeps, 'organizationLogos'>, organizationId: string): Promise<string | null> => {
  const source = await deps.organizationLogos.find(organizationId);
  return source?.kind === 'media' ? source.mediaId : null;
};
