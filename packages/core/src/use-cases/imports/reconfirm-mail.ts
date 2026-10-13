import { reconfirmEmail, SYSTEM_SENDER, type Job, type Message } from '@tt/domain';
import type { TaskQueue } from '../../intake-ports.js';
import type { ImportMailDeps } from '../../import-ports.js';
import { enqueueDelivery } from '../messaging/send-message.js';
import { ensureConversation, oneLine } from '../messaging/shared.js';

export interface ReconfirmMailInput {
  readonly organization: { readonly id: string; readonly name: string };
  readonly job: Job;
  readonly applicationId: string;
  readonly candidate: { readonly id: string; readonly firstName: string };
  /** The raw secret of the consent token: it exists only here, in the link. */
  readonly secret: string;
}

/**
 * Queues the reconfirmation email through the normal messaging path: a system message in the application's conversation,
 * delivered by the `email.send` worker. Never throws: the import is already stored. Returns whether it was queued.
 */
export async function queueReconfirmation(
  deps: { readonly mail: ImportMailDeps; readonly queue: TaskQueue; readonly newId: () => string; readonly now: () => Date; readonly onMailError?: ((error: unknown) => void) | undefined },
  input: ReconfirmMailInput,
): Promise<boolean> {
  try {
    const email = reconfirmEmail({
      language: input.job.content.language,
      firstName: input.candidate.firstName,
      organizationName: input.organization.name,
      jobTitle: input.job.content.title,
      url: `${deps.mail.config.platformUrl}/consent/${input.secret}`,
    });
    await ensureConversation(deps.mail, input.organization.id, input.applicationId);
    const message: Message = await deps.mail.messages.create({
      id: deps.newId(),
      organizationId: input.organization.id,
      applicationId: input.applicationId,
      candidateId: input.candidate.id,
      direction: 'outbound',
      subject: oneLine(email.subject),
      bodyText: email.body,
      status: 'queued',
      providerMessageId: null,
      sentBy: SYSTEM_SENDER,
      createdAt: deps.now(),
      sentAt: null,
      error: null,
      rawText: null,
      unverifiedSender: false,
      inboundMessageId: null,
    });
    return await enqueueDelivery({ queue: deps.queue, messages: deps.mail.messages }, message);
  } catch (error) {
    deps.onMailError?.(error);
    return false;
  }
}
