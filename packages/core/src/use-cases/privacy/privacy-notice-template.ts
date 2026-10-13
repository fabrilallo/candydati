import { SUPPORTED_LOCALES } from '@tt/domain';
import { z } from 'zod';
import { NotFoundError } from '../../errors.js';
import { definePrivacyUseCase } from './define.js';
import { renderPrivacyTemplate } from './privacy-template.js';

/** A starting point with the organization name and contact filled in. The data controller must review it. */
export const privacyNoticeTemplate = definePrivacyUseCase({
  name: 'privacyNoticeTemplate',
  input: z.object({ language: z.enum(SUPPORTED_LOCALES), contactEmail: z.email().optional() }),
  permission: 'privacy:manage',
  audit: { skip: 'generates text, reads no personal data' },
  handler: async ({ deps, actor, input }): Promise<{ readonly text: string }> => {
    const organization = await deps.organizations.findById(actor.organizationId);
    if (!organization) throw new NotFoundError('Organization not found.');
    return {
      text: renderPrivacyTemplate({
        language: input.language,
        organizationName: organization.name,
        ...(input.contactEmail === undefined ? {} : { contactEmail: input.contactEmail }),
      }),
    };
  },
});
