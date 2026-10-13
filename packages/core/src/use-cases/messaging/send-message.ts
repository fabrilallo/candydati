import {
  BULK_MESSAGE_MAX,
  EMAIL_TEMPLATE_BODY_MAX,
  EMAIL_TEMPLATE_SUBJECT_MAX,
  renderTemplate,
  type Message,
} from '@tt/domain';
import { z } from 'zod';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import type { MessagingDeps } from '../../messaging-ports.js';
import { requireJob } from '../jobs/shared.js';
import { requireCandidate } from '../candidates/shared.js';
import { defineMessagingUseCase } from './define.js';
import { assertKnownVariables } from './email-templates.js';
import { buildTemplateValues, DEFAULT_TEMPLATE_PREFIX, ensureConversation, oneLine, requireOrganization } from './shared.js';
import type { SendMessageResult } from './views.js';

const QUEUE_FAILED = 'queue_unavailable';

/** Stores the message as `failed` when its delivery task could not be queued, so it never stays `queued` forever. */
export async function enqueueDelivery(deps: Pick<MessagingDeps, 'queue' | 'messages'>, message: Message): Promise<boolean> {
  try {
    await deps.queue.enqueue('email.send', { organizationId: message.organizationId, messageId: message.id });
    return true;
  } catch {
    await deps.messages.save({ ...message, status: 'failed', error: QUEUE_FAILED });
    return false;
  }
}

async function assertTemplateExists(deps: MessagingDeps, organizationId: string, templateId: string): Promise<void> {
  if (templateId.startsWith(DEFAULT_TEMPLATE_PREFIX)) return;
  if (!(await deps.templates.findById(organizationId, templateId))) throw new NotFoundError('Template not found.');
}

/**
 * Sends one email to each of the applications (bulk = many ids). Everything is validated and rendered before anything
 * is stored; then one `queued` message and one `email.send` task per recipient. Always a person's decision: the agent
 * never sends (PLAN §6). Closed applications can receive messages: outcome messages go out after deciding.
 */
export const sendMessage = defineMessagingUseCase({
  name: 'sendMessage',
  input: z.object({
    applicationIds: z.array(z.string().min(1)).min(1).max(BULK_MESSAGE_MAX),
    templateId: z.string().min(1).optional(),
    subject: z.string().trim().min(1).max(EMAIL_TEMPLATE_SUBJECT_MAX),
    body: z.string().trim().min(1).max(EMAIL_TEMPLATE_BODY_MAX),
  }),
  permission: 'message:send',
  audit: { skip: 'each message is audited by deliverMessage (message.sent / message.failed) with the user in `sentBy`' },
  handler: async ({ deps, actor, input }): Promise<SendMessageResult> => {
    if (actor.type === 'agent') throw new ForbiddenError('The agent never sends messages to candidates.');
    const { organizationId } = actor;
    assertKnownVariables(input.subject, input.body);
    if (input.templateId !== undefined) await assertTemplateExists(deps, organizationId, input.templateId);
    const organization = await requireOrganization(deps, organizationId);
    const sentBy = actor.onBehalfOfUserId ?? actor.id ?? 'system';
    const now = deps.now();
    const drafts = await Promise.all(
      [...new Set(input.applicationIds)].map(async (applicationId): Promise<Message> => {
        const application = await deps.applications.findById(organizationId, applicationId);
        if (!application) throw new NotFoundError('Application not found.');
        const candidate = await requireCandidate(deps, organizationId, application.candidateId);
        const job = await requireJob(deps, organizationId, application.jobId);
        const values = buildTemplateValues({ config: deps.config, organization, job, candidate, stageId: application.stageId });
        const subject = oneLine(renderTemplate(input.subject, values).text);
        if (subject === '') throw new ValidationError([{ path: 'subject', message: 'subject_empty' }]);
        return {
          id: deps.newId(),
          organizationId,
          applicationId,
          candidateId: candidate.id,
          direction: 'outbound',
          subject,
          bodyText: renderTemplate(input.body, values).text,
          status: 'queued',
          providerMessageId: null,
          sentBy,
          createdAt: now,
          sentAt: null,
          error: null,
          rawText: null,
          unverifiedSender: false,
          inboundMessageId: null,
        };
      }),
    );
    const stored: Message[] = [];
    for (const draft of drafts) {
      await ensureConversation(deps, organizationId, draft.applicationId);
      stored.push(await deps.messages.create(draft));
    }
    const results = await Promise.all(stored.map((message) => enqueueDelivery(deps, message)));
    const queued = results.filter(Boolean).length;
    return { queued, failed: results.length - queued };
  },
});
