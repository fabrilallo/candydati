import { SYSTEM_SENDER, textToHtml, type Message } from '@tt/domain';
import { z } from 'zod';
import { toAuditActor, type Actor } from '../../actor.js';
import type { DeliverDeps } from '../../messaging-ports.js';
import { defineUseCase } from '../../use-case.js';
import { ensureConversation, formatFrom, replyToAddress, senderIdentity } from './shared.js';
import type { DeliverResult } from './views.js';

export const DELIVERY_FAILED = 'delivery_failed';
export const DELIVERY_REJECTED = 'delivery_rejected';
export const RECIPIENT_MISSING = 'recipient_missing';

const inputSchema = z.object({
  organizationId: z.string().min(1),
  messageId: z.string().min(1),
  /** The worker passes false while retries remain: a transient error is then rethrown instead of marking `failed`. */
  lastAttempt: z.boolean().default(true),
});

const isPermanent = (error: unknown): boolean => (error as { permanent?: unknown } | null)?.permanent === true;

async function recordOutcome(deps: DeliverDeps, actor: Actor, message: Message, done: Message): Promise<void> {
  await deps.messages.save(done);
  await deps.auditLog.append({
    organizationId: message.organizationId,
    actor: toAuditActor(actor),
    action: done.status === 'sent' ? 'message.sent' : 'message.failed',
    target: { type: 'message', id: message.id },
    metadata: { applicationId: message.applicationId, sentBy: message.sentBy ?? SYSTEM_SENDER, ...(done.error ? { error: done.error } : {}) },
  });
}

/**
 * Worker use case (system actor, task `email.send`). Idempotent: a message that is not `queued` any more is left as it
 * is. Transient send errors are rethrown while retries remain; the stored error is a short code, never the provider's text.
 */
export const deliverMessage = defineUseCase<DeliverDeps, typeof inputSchema, DeliverResult>({
  name: 'deliverMessage',
  input: inputSchema,
  organizationOf: (input) => input.organizationId,
  permission: { skip: 'system job enqueued by sendMessage and submitApplication; the organization scope still applies' },
  audit: { skip: 'recorded in the handler, only when the message really changes state' },
  handler: async ({ deps, actor, input }): Promise<DeliverResult> => {
    const { organizationId } = input;
    const message = await deps.messages.findById(organizationId, input.messageId);
    if (!message || message.status !== 'queued' || message.direction !== 'outbound') return 'skipped';
    const [candidate, organization, settings] = await Promise.all([
      deps.candidates.findById(organizationId, message.candidateId),
      deps.organizations.findById(organizationId),
      deps.settings.find(organizationId),
    ]);
    if (!candidate || !organization) {
      await recordOutcome(deps, actor, message, { ...message, status: 'failed', error: RECIPIENT_MISSING });
      return 'failed';
    }
    const conversation = await ensureConversation(deps, organizationId, message.applicationId);
    let providerMessageId: string;
    try {
      ({ providerMessageId } = await deps.sender.send({
        from: formatFrom(senderIdentity(deps.config, organization, settings)),
        replyTo: replyToAddress(deps.config, conversation),
        to: candidate.email,
        subject: message.subject,
        text: message.bodyText,
        html: textToHtml(message.bodyText),
        headers: message.sentBy === SYSTEM_SENDER ? { 'Auto-Submitted': 'auto-generated' } : {},
      }));
    } catch (error) {
      const permanent = isPermanent(error);
      if (!permanent && !input.lastAttempt) throw error;
      await recordOutcome(deps, actor, message, { ...message, status: 'failed', error: permanent ? DELIVERY_REJECTED : DELIVERY_FAILED });
      return 'failed';
    }
    await recordOutcome(deps, actor, message, { ...message, status: 'sent', sentAt: deps.now(), providerMessageId, error: null });
    return 'sent';
  },
});
