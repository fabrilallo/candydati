import { SYSTEM_SENDER } from '@candydati/domain';
import { z } from 'zod';
import { defineMessagingUseCase } from './define.js';
import { requireApplicationInOrganization } from './shared.js';
import type { MessageView } from './views.js';

const UNKNOWN_SENDER = 'Former member';

/** The conversation of an application, oldest first. */
export const listMessages = defineMessagingUseCase({
  name: 'listMessages',
  input: z.object({ applicationId: z.string().min(1) }),
  permission: 'message:read',
  audit: { skip: 'listing: opening the candidate profile is what gets audited' },
  handler: async ({ deps, actor, input }): Promise<readonly MessageView[]> => {
    const application = await requireApplicationInOrganization(deps, actor.organizationId, input.applicationId);
    const messages = await deps.messages.listByApplication(actor.organizationId, application.id);
    const userIds = [...new Set(messages.flatMap((m) => (m.sentBy !== null && m.sentBy !== SYSTEM_SENDER ? [m.sentBy] : [])))];
    const names = await deps.users.namesOf(actor.organizationId, userIds);
    return messages.map((message) => ({
      message,
      senderName: message.sentBy === null || message.sentBy === SYSTEM_SENDER ? null : (names[message.sentBy] ?? UNKNOWN_SENDER),
    }));
  },
});
