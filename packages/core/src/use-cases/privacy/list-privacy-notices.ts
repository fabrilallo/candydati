import type { PrivacyNotice } from '@tt/domain';
import { z } from 'zod';
import { definePrivacyUseCase } from './define.js';

/** Every version, newest first: old versions stay readable because applications reference them. */
export const listPrivacyNotices = definePrivacyUseCase({
  name: 'listPrivacyNotices',
  input: z.object({}),
  permission: 'privacy:manage',
  audit: { skip: 'read of organization settings, no personal data' },
  handler: async ({ deps, actor }): Promise<readonly PrivacyNotice[]> => deps.privacyNotices.list(actor.organizationId),
});
