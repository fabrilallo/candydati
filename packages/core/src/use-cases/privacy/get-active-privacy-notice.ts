import type { PrivacyNotice } from '@candydati/domain';
import { z } from 'zod';
import { definePrivacyUseCase } from './define.js';

/** The notice candidates currently see. Null until the organization publishes its first one. */
export const getActivePrivacyNotice = definePrivacyUseCase({
  name: 'getActivePrivacyNotice',
  input: z.object({}),
  permission: { skip: 'any member of the organization may read the active notice (it is public text)' },
  audit: { skip: 'read of public text, no personal data' },
  handler: async ({ deps, actor }): Promise<PrivacyNotice | null> => deps.privacyNotices.findActive(actor.organizationId),
});
