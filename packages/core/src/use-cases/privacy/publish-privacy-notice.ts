import { privacyNoticeInputSchema, type PrivacyNotice } from '@tt/domain';
import { definePrivacyUseCase } from './define.js';

/** Every save is a new immutable version: previous consents keep pointing at the text they agreed to. */
export const publishPrivacyNotice = definePrivacyUseCase({
  name: 'publishPrivacyNotice',
  input: privacyNoticeInputSchema,
  permission: 'privacy:manage',
  audit: {
    action: 'privacy_notice.published',
    target: (_input, notice: PrivacyNotice) => ({ type: 'privacy_notice', id: notice.id }),
    metadata: (_input, notice: PrivacyNotice) => ({ version: notice.version }),
  },
  handler: async ({ deps, actor, input }): Promise<PrivacyNotice> => {
    const active = await deps.privacyNotices.findActive(actor.organizationId);
    return deps.privacyNotices.create({
      ...input,
      id: deps.newId(),
      organizationId: actor.organizationId,
      version: (active?.version ?? 0) + 1,
      createdBy: actor.onBehalfOfUserId ?? actor.id ?? 'system',
      createdAt: deps.now(),
    });
  },
});
